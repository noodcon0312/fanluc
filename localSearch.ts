// ============================================================================
// localSearch.ts — search helpers tuned for running on the user's OWN machine.
//
// Why localhost helps: requests leave from a normal home/office IP instead of a
// datacenter IP, so Bing / Mojeek rarely show CAPTCHAs, and
// language / region come from this PC. What we add on top of the raw engines:
//   * hard per-engine timeouts (one hanging engine can't stall the tool)
//   * health tracking: an engine that keeps failing is skipped for a few minutes
//   * short result cache (same query within 10 min = instant)
//   * reciprocal-rank fusion (a URL found by several engines ranks higher)
//   * image search WITHOUT SearXNG: Bing images + Wikimedia
//     Commons + Openverse (open APIs) as a safety net. SearXNG stays optional.
// ============================================================================

export interface WebHit {
  url: string;
  title: string;
  snippet: string;
  engine: string;
}

export interface ImageHit {
  title: string;
  src: string;
  thumb: string;
  page: string;
  engine: string;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ---- locale taken from this machine (override: SEARCH_LANG=vi-VN) -----------
function detectLocale(): string {
  const env = process.env.SEARCH_LANG;
  if (env) return env;
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
  } catch {
    return "en-US";
  }
}
export const LOCALE = detectLocale(); // e.g. "vi-VN"
const LANG = LOCALE.split("-")[0] || "en";
const REGION = (LOCALE.split("-")[1] || "US").toUpperCase();
export const ACCEPT_LANGUAGE = `${LOCALE},${LANG};q=0.9,en;q=0.8`;

// ---- small utils --------------------------------------------------------------
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)));
}
function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

async function getText(url: string, ms: number, headers: Record<string, string> = {}): Promise<string> {
  const resp = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": ACCEPT_LANGUAGE, ...headers },
    signal: AbortSignal.timeout(ms),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.text();
}

async function getJson(url: string, ms: number, headers: Record<string, string> = {}): Promise<any> {
  const resp = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", "Accept-Language": ACCEPT_LANGUAGE, ...headers },
    signal: AbortSignal.timeout(ms),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

// ---- engine health (circuit breaker) --------------------------------------------
interface Health {
  fails: number;
  until: number;
  lastError?: string;
}
const health = new Map<string, Health>();

export function engineStatus(): Record<string, { ok: boolean; fails: number; retryInSec: number; lastError?: string }> {
  const out: Record<string, any> = {};
  const now = Date.now();
  for (const [k, h] of health) out[k] = { ok: h.until <= now, fails: h.fails, retryInSec: Math.max(0, Math.round((h.until - now) / 1000)), lastError: h.lastError };
  return out;
}

/** Run one engine with timeout + health tracking. Never throws. */
export async function runEngine<T>(name: string, fn: () => Promise<T[]>, timeoutMs = 5000): Promise<T[]> {
  const h = health.get(name);
  if (h && h.until > Date.now()) return [];
  try {
    const res = await Promise.race([
      fn(),
      new Promise<T[]>((_r, rej) => setTimeout(() => rej(new Error(`timeout ${timeoutMs}ms`)), timeoutMs).unref?.()),
    ]);
    if (res.length === 0) {
      // 0 results is suspicious (captcha page) but can also be a rare query: soft penalty only
      const cur = health.get(name) || { fails: 0, until: 0 };
      cur.fails += 0.5;
      if (cur.fails >= 3) cur.until = Date.now() + 2 * 60 * 1000;
      health.set(name, cur);
    } else {
      health.delete(name);
    }
    return res;
  } catch (e: any) {
    const cur = health.get(name) || { fails: 0, until: 0 };
    cur.fails += 1;
    cur.lastError = e?.message || String(e);
    if (cur.fails >= 2) cur.until = Date.now() + Math.min(30, 2 ** (cur.fails - 1)) * 60 * 1000; // 2,4,8..30 min
    health.set(name, cur);
    return [];
  }
}

// ---- tiny TTL cache ---------------------------------------------------------------
const cache = new Map<string, { exp: number; value: any }>();
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, shouldCache: (v: T) => boolean = () => true): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value as T;
  const value = await fn();
  if (shouldCache(value)) {
    cache.set(key, { exp: Date.now() + ttlMs, value });
    if (cache.size > 300) cache.delete(cache.keys().next().value as string);
  }
  return value;
}

// ---- reciprocal rank fusion -----------------------------------------------------------
function dedupeKey(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "")).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** A page returned by several engines scores higher; ties keep the better single rank. */
export function fuseResults(lists: WebHit[][]): WebHit[] {
  const K = 60;
  const map = new Map<string, { hit: WebHit; score: number }>();
  for (const list of lists) {
    list.forEach((hit, i) => {
      const key = dedupeKey(hit.url);
      const add = 1 / (K + i + 1);
      const cur = map.get(key);
      if (cur) {
        cur.score += add;
        if ((hit.snippet || "").length > (cur.hit.snippet || "").length) cur.hit = { ...cur.hit, snippet: hit.snippet };
        cur.hit.engine += `+${hit.engine}`;
      } else map.set(key, { hit: { ...hit }, score: add });
    });
  }
  return [...map.values()].sort((a, b) => b.score - a.score).map((x) => x.hit);
}

// ===========================================================================
// Web engines (new ones; Bing/DDG/Yahoo already live in server.ts)
// ===========================================================================

/** Mojeek: independent index, plain HTML, very tolerant of scraping. */
export async function searchMojeek(query: string, count: number): Promise<WebHit[]> {
  const html = await getText(`https://www.mojeek.com/search?q=${encodeURIComponent(query.trim())}&lb=${LANG}`, 5000);
  const out: WebHit[] = [];
  const re = /<li[^>]*>\s*<h2>\s*<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="title"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/gi;
  const re2 = /<a[^>]+class="title"[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]+class="title"|<\/ul>)/gi;
  let m: RegExpExecArray | null;
  while ((m = re2.exec(html)) !== null && out.length < count * 2) {
    const title = stripTags(m[2]);
    const sn = m[3].match(/<p[^>]*class="s"[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = sn ? stripTags(sn[1]) : title;
    if (title) out.push({ url: decodeEntities(m[1]), title, snippet, engine: "mojeek" });
  }
  void re;
  return out;
}

/** Bing with this machine's language/region (the existing Bing engine is hard-wired to en-US). */
export async function searchBingLocal(query: string, count: number): Promise<WebHit[]> {
  const html = await getText(
    `https://www.bing.com/search?q=${encodeURIComponent(query.trim())}&count=${Math.min(30, count * 3)}&setlang=${encodeURIComponent(LOCALE)}&cc=${REGION}`,
    5000
  );
  if (/captcha|unusual traffic|verify you are a human|\/ck\/a\?!&&p=.*challenge/i.test(html) && !/class="b_algo"/.test(html)) throw new Error("bing captcha");
  const out: WebHit[] = [];
  const re = /<li class="b_algo"[^>]*>[\s\S]*?<h2[^>]*>[\s\S]*?<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < count * 2) {
    const url = decodeEntities(m[1]);
    if (!url.startsWith("http")) continue;
    const title = stripTags(m[2]);
    const p = m[3].match(/<p[^>]*>([\s\S]*?)<\/p>/i) || m[3].match(/<div class="b_caption"[^>]*>([\s\S]*?)<\/div>/i);
    out.push({ url, title, snippet: p ? stripTags(p[1]) : title, engine: "bing" });
  }
  return out;
}


/** Wikipedia (official open API, no key). Great for facts; the AI's own language first, then English. */
export async function searchWikipedia(query: string, count: number): Promise<WebHit[]> {
  const langs = LANG === "en" ? ["en"] : [LANG, "en"];
  const lists = await Promise.all(
    langs.map(async (lg) => {
      try {
        const j = await getJson(
          `https://${lg}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query.trim())}&srlimit=${Math.min(5, count)}&format=json&utf8=1`,
          4000
        );
        return ((j?.query?.search || []) as any[]).map((r) => ({
          url: `https://${lg}.wikipedia.org/wiki/${encodeURIComponent(String(r.title).replace(/ /g, "_"))}`,
          title: String(r.title),
          snippet: stripTags(String(r.snippet || r.title)),
          engine: "wikipedia",
        })) as WebHit[];
      } catch {
        return [] as WebHit[];
      }
    })
  );
  return lists.flat().slice(0, count);
}

/**
 * Run engines in parallel but DON'T wait for the slowest: resolve as soon as `enough(results)` is true
 * (plus a short grace so a fast second engine can still contribute), or at `deadlineMs`.
 */
export async function raceUntilEnough<T>(
  tasks: Promise<T[]>[],
  enough: (collected: T[][]) => boolean,
  deadlineMs = 4500,
  graceMs = 350
): Promise<T[][]> {
  const collected: T[][] = tasks.map(() => []);
  return new Promise((resolve) => {
    let done = false;
    let graceTimer: NodeJS.Timeout | null = null;
    let pending = tasks.length;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(deadline);
      if (graceTimer) clearTimeout(graceTimer);
      resolve(collected.map((c) => c.slice()));
    };
    const deadline = setTimeout(finish, deadlineMs);
    tasks.forEach((t, i) => {
      t.then((r) => {
        collected[i] = r;
      })
        .catch(() => {})
        .finally(() => {
          pending--;
          if (pending === 0) return finish();
          if (!done && !graceTimer && enough(collected)) graceTimer = setTimeout(finish, graceMs);
        });
    });
    if (tasks.length === 0) finish();
  });
}


// ---- strict keyword match (used for low-diversity sources: Wikimedia / Openverse) ----------
const STOP = new Set(["a","an","the","of","and","or","in","on","for","to","with","image","images","photo","photos","picture","pictures","pic","anh","hinh"]);
function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0111/g, "d").replace(/\u0110/g, "D").toLowerCase();
}
/** True only if EVERY meaningful query word appears as a whole word in `text` (so "claude logo" never matches "Claude Monet"). */
export function matchesAllKeywords(query: string, text: string): boolean {
  const toks = norm(query).split(/[^a-z0-9\u0080-\uffff]+/).filter((t) => t && !STOP.has(t));
  if (toks.length === 0) return false;
  const hay = norm(text);
  return toks.every((t) => {
    if (/[^\x00-\x7f]/.test(t)) return hay.includes(t); // CJK etc.
    return new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?($|[^a-z0-9])`).test(hay);
  });
}

// ===========================================================================
// Image engines
// ===========================================================================

/** SearXNG images (optional). */
export async function imagesSearxng(baseUrl: string, query: string, count: number): Promise<ImageHit[]> {
  if (!baseUrl) return [];
  const params = new URLSearchParams({ q: query.trim(), format: "json", categories: "images", pageno: "1" });
  const j = await getJson(`${baseUrl.replace(/\/$/, "")}/search?${params}`, 4000);
  const out: ImageHit[] = [];
  for (const x of Array.isArray(j.results) ? j.results : []) {
    const src = String(x.img_src || "");
    if (!/^https?:\/\//i.test(src)) continue;
    out.push({ title: String(x.title || x.content || query), src, thumb: String(x.thumbnail_src || x.thumbnail || src), page: String(x.url || src), engine: "searxng" });
    if (out.length >= count * 2) break;
  }
  return out;
}

/** Bing Images (HTML fragment endpoint; each tile carries JSON in the m="" attribute). */
export async function imagesBing(query: string, count: number): Promise<ImageHit[]> {
  const html = await getText(
    `https://www.bing.com/images/async?q=${encodeURIComponent(query.trim())}&first=0&count=${Math.min(35, count * 3)}&mmasync=1&setlang=${encodeURIComponent(LOCALE)}`,
    6000
  );
  const out: ImageHit[] = [];
  const tagRe = /<a\b[^>]*\bclass="[^"]*\biusc\b[^"]*"[^>]*>/gi;
  let t: RegExpExecArray | null;
  while ((t = tagRe.exec(html)) !== null && out.length < count * 2) {
    const mm = t[0].match(/\bm="([^"]*)"/) || t[0].match(/\bm='([^']*)'/);
    if (!mm) continue;
    try {
      const j = JSON.parse(decodeEntities(mm[1]));
      const src = String(j.murl || "");
      if (!/^https?:\/\//i.test(src)) continue;
      out.push({ title: decodeEntities(String(j.t || j.desc || query)).replace(/<[^>]*>/g, ""), src, thumb: String(j.turl || src), page: String(j.purl || src), engine: "bing-img" });
    } catch {}
  }
  return out;
}

/** Wikimedia Commons: free, no key, great for places / animals / history / science. */
export async function imagesWikimedia(query: string, count: number): Promise<ImageHit[]> {
  const params = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: String(Math.min(20, count * 2)),
    gsrsearch: query.trim(), prop: "imageinfo", iiprop: "url|mime", iiurlwidth: "480", origin: "*",
  });
  const j = await getJson(`https://commons.wikimedia.org/w/api.php?${params}`, 5000);
  const pages: any[] = Object.values(j?.query?.pages || {});
  pages.sort((a, b) => (a.index || 0) - (b.index || 0));
  const out: ImageHit[] = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || !/^image\/(jpeg|png|webp|gif)$/.test(ii.mime || "")) continue;
    // Commons is narrow: only accept a file whose title contains ALL the keywords.
    if (!matchesAllKeywords(query, String(p.title || "").replace(/^File:/, ""))) continue;
    out.push({ title: String(p.title || query).replace(/^File:/, ""), src: ii.url, thumb: ii.thumburl || ii.url, page: ii.descriptionurl || ii.url, engine: "wikimedia" });
  }
  return out;
}

/** Openverse: Creative-Commons images, anonymous access (rate-limited per IP, fine as a fallback). */
export async function imagesOpenverse(query: string, count: number): Promise<ImageHit[]> {
  const j = await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(query.trim())}&page_size=${Math.min(20, count * 2)}`, 6000);
  const out: ImageHit[] = [];
  for (const x of Array.isArray(j.results) ? j.results : []) {
    const src = String(x.url || "");
    if (!/^https?:\/\//i.test(src)) continue;
    // Same strictness: title + tags must contain ALL the keywords.
    const text = `${x.title || ""} ${(Array.isArray(x.tags) ? x.tags : []).map((t: any) => t?.name || "").join(" ")}`;
    if (!matchesAllKeywords(query, text)) continue;
    out.push({ title: String(x.title || query), src, thumb: String(x.thumbnail || src), page: String(x.foreign_landing_url || src), engine: "openverse" });
  }
  return out;
}

/**
 * Image search chain:
 *   Bing + Wikimedia Commons + Openverse (+ SearXNG if configured), all in parallel, no API key.
 *   Returns as soon as enough images are in, never waits for the slowest engine.
 */
export async function searchImages(query: string, count: number, searxUrl = ""): Promise<ImageHit[]> {
  const key = `img:${LOCALE}:${searxUrl}:${query.toLowerCase().trim()}:${count}`;
  return cached(
    key,
    10 * 60 * 1000,
    async () => {
      const seen = new Set<string>();
      const merged: ImageHit[] = [];
      const push = (list: ImageHit[]) => {
        for (const h of list) {
          const k = h.src.split("?")[0].toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          merged.push(h);
        }
      };
      const lists = await raceUntilEnough(
        [
          searxUrl ? runEngine("img:searxng", () => imagesSearxng(searxUrl, query, count), 4000) : Promise.resolve([] as ImageHit[]),
          runEngine("img:bing", () => imagesBing(query, count), 4000),
          runEngine("img:wikimedia", () => imagesWikimedia(query, count), 4000),
          runEngine("img:openverse", () => imagesOpenverse(query, count), 4000),
        ],
        (c) => c.reduce((n, a) => n + a.length, 0) >= count,
        4500
      );
      // Bing/SearXNG lead (interleaved); the strict-filtered Commons/Openverse hits only fill the tail.
      const main = [lists[0], lists[1]];
      const maxLen = Math.max(...main.map((a) => a.length), 0);
      for (let i = 0; i < maxLen; i++) for (const a of main) if (a[i]) push([a[i]]);
      push(lists[2]);
      push(lists[3]);
      return merged.slice(0, count);
    },
    (v) => v.length > 0
  );
}
