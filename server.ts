import express from "express";
import path from "path";
import fs from "fs";
import { execFile, execFileSync, spawn } from "child_process";
import { createServer as createViteServer } from "vite";
import { translate } from "google-translate-api-x";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import dotenv from "dotenv";
import dns from "node:dns/promises";
import net from "node:net";
dotenv.config();
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { registerLocalRoutes, getWorkspace, onWorkspaceChange, requireLocal, SHELL } from "./localExec";
import { searchImages, searchMojeek, searchBingLocal, searchWikipedia, raceUntilEnough, runEngine, cached, fuseResults, engineStatus, LOCALE, ACCEPT_LANGUAGE } from "./localSearch";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// ============================================================================
// Web Search & Fetch helpers
//
// Goal: search multiple free, no-API-key engines in parallel (so one engine
// getting blocked/rate-limited doesn't take the whole tool down), then filter
// out domains that are known to block scraping / require login / render
// nothing without JS, and rank the survivors so well-established, reputable
// sources are offered first. Fetch then extracts the actual article content
// (via Mozilla's Readability algorithm - the same engine behind Firefox's
// Reader View) instead of dumping every nav/ads/footer string on the page.
// ============================================================================

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Hosts that are effectively unfetchable as plain HTML: they either require a
// login, render everything client-side via JS, or actively block scrapers.
// Kept out of search results entirely, and fast-failed (no network round
// trip) if the AI tries to fetch() one directly.
const BLOCKED_HOST_SUFFIXES = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "threads.net",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "linkedin.com",
  "pinterest.com",
  "pinterest.jp",
  "quora.com",
  "discord.com",
  "discord.gg",
  "messenger.com",
  "whatsapp.com",
  "t.me",
  "telegram.org",
  "youtube.com",
  "youtu.be",
  "music.youtube.com",
  "zalo.me",
  "scribd.com",
  "academia.edu",
  "accounts.google.com",
  "myaccount.google.com",
];

// Hosts that ARE fetchable, just not at the URL an engine hands back. Rewrite
// before fetching instead of blocking outright.
const DOMAIN_REWRITES: Record<string, string> = {
  "reddit.com": "old.reddit.com",
  "www.reddit.com": "old.reddit.com",
};

// Sources worth ranking higher: encyclopedic/reference, .gov/.edu, major wire
// services & newsrooms, and well-known Vietnamese outlets (since this tool is
// used mostly for Vietnamese-language queries). This is a ranking boost, not
// an allowlist - unknown domains still get through, just lower in the list.
const REPUTABLE_HOST_SUFFIXES = [
  "wikipedia.org",
  "github.com",
  "stackoverflow.com",
  "developer.mozilla.org",
  "docs.python.org",
  "npmjs.com",
  "arxiv.org",
  "bbc.com",
  "reuters.com",
  "apnews.com",
  "nytimes.com",
  "theguardian.com",
  "forbes.com",
  "bloomberg.com",
  "nature.com",
  "sciencedirect.com",
  "vnexpress.net",
  "tuoitre.vn",
  "thanhnien.vn",
  "nhandan.vn",
  "baochinhphu.vn",
  "vietnamnet.vn",
  "laodong.vn",
  "dantri.com.vn",
  "vtv.vn",
  "vov.vn",
];
const REPUTABLE_TLD_SUFFIXES = [".gov", ".edu", ".gov.vn", ".edu.vn"];

const NON_HTML_EXTENSIONS = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".zip", ".rar", ".7z", ".tar", ".gz",
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico",
  ".mp3", ".mp4", ".avi", ".mov", ".wav", ".exe", ".apk", ".dmg",
];

function hostMatchesSuffixList(hostname: string, suffixes: string[]): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return suffixes.some((s) => h === s || h.endsWith("." + s));
}

function isBlockedHost(hostname: string): boolean {
  if (!hostname) return false;
  return hostMatchesSuffixList(hostname, BLOCKED_HOST_SUFFIXES);
}

function applyDomainRewrite(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    if (DOMAIN_REWRITES[host]) {
      u.hostname = DOMAIN_REWRITES[host];
      return u.toString();
    }
    return urlStr;
  } catch {
    return urlStr;
  }
}

function reputationScore(hostname: string): number {
  if (!hostname) return 0;
  const h = hostname.toLowerCase();
  if (hostMatchesSuffixList(h, REPUTABLE_HOST_SUFFIXES)) return 10;
  if (REPUTABLE_TLD_SUFFIXES.some((tld) => h.endsWith(tld))) return 8;
  return 0;
}

function looksLikeNonHtmlFile(urlStr: string): boolean {
  try {
    const p = new URL(urlStr).pathname.toLowerCase();
    return NON_HTML_EXTENSIONS.some((ext) => p.endsWith(ext));
  } catch {
    return false;
  }
}

function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, "\"")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function stripInnerTags(str: string): string {
  if (!str) return "";
  return str.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

interface RawSearchResult {
  url: string;
  title: string;
  snippet: string;
  engine: string;
}


// --- Engine 2: Bing HTML (organic results render with real hrefs in the
// no-JS markup) ---
async function searchBing(query: string, count: number): Promise<RawSearchResult[]> {
  const results: RawSearchResult[] = [];
  try {
    const q = encodeURIComponent(query.trim());
    const resp = await fetch(`https://www.bing.com/search?q=${q}&count=${Math.min(30, count * 3)}&setlang=en-US`, {
      headers: {
        "User-Agent": DESKTOP_UA,
        "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
      },
    });
    if (!resp.ok) return results;
    const html = await resp.text();
    const resultRegex = /<li class="b_algo"[^>]*>[\s\S]*?<h2>[\s\S]*?<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>([\s\S]*?)<\/li>/gi;
    let m: RegExpExecArray | null;
    while ((m = resultRegex.exec(html)) !== null && results.length < count * 2) {
      const url = m[1];
      if (!url.startsWith("http")) continue;
      const title = decodeHtmlEntities(stripInnerTags(m[2]));
      const bodyBlock = m[3] || "";
      const snippetMatch =
        bodyBlock.match(/<p[^>]*>([\s\S]*?)<\/p>/i) ||
        bodyBlock.match(/<div class="b_caption"[^>]*>([\s\S]*?)<\/div>/i);
      const snippet = snippetMatch ? decodeHtmlEntities(stripInnerTags(snippetMatch[1])) : title;
      if (!title && !snippet) continue;
      results.push({ url, title, snippet, engine: "bing" });
    }
  } catch (err) {
    console.warn("Bing search error:", err);
  }
  return results;
}

// --- Engine 3: Yahoo Japan search (primary Yahoo engine) ---
async function searchYahooJP(query: string, count: number): Promise<RawSearchResult[]> {
  const results: RawSearchResult[] = [];
  const q = encodeURIComponent(query.trim());

  try {
    const response = await fetch(`https://search.yahoo.co.jp/search?p=${q}`, {
      headers: {
        "User-Agent": DESKTOP_UA,
        "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const html = await response.text();
      const cardRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?(?:<(?:p|div)[^>]*class="[^"]*(?:summary|Snippet|desc|text)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>)?/gi;
      let match: RegExpExecArray | null;
      const seen = new Set<string>();
      while ((match = cardRegex.exec(html)) !== null && results.length < count) {
        const url = match[1];
        if (!url || !url.startsWith("http") || url.includes("search.yahoo.co.jp") || url === "https://www.yahoo.co.jp" || url === "https://www.yahoo.co.jp/") continue;
        if (seen.has(url)) continue;
        seen.add(url);
        const title = decodeHtmlEntities(stripInnerTags(match[2]));
        const snippet = match[3] ? decodeHtmlEntities(stripInnerTags(match[3])) : title;
        if (title) {
          results.push({ url, title, snippet, engine: "yahoo" });
        }
      }
    }
  } catch (_err) {
    // Silently continue to fallback engines
  }

  if (results.length === 0) {
    try {
      const newsRes = await fetch(`https://news.search.yahoo.com/search?p=${q}`, {
        headers: { "User-Agent": DESKTOP_UA },
        signal: AbortSignal.timeout(5000),
      });
      if (newsRes.ok) {
        const newsHtml = await newsRes.text();
        const newsRegex = /<h4[^>]*><a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a><\/h4>/gi;
        let nMatch: RegExpExecArray | null;
        while ((nMatch = newsRegex.exec(newsHtml)) !== null && results.length < count) {
          let link = nMatch[1];
          if (link.includes("/RU=")) {
            const ruMatch = link.match(/\/RU=([^/]+)/);
            if (ruMatch) link = decodeURIComponent(ruMatch[1]);
          }
          const title = decodeHtmlEntities(stripInnerTags(nMatch[2]));
          if (link.startsWith("http")) {
            results.push({ url: link, title, snippet: title, engine: "yahoo-news" });
          }
        }
      }
    } catch (_err) {
      // ignore
    }
  }

  return results;
}

function interleaveResults(arrays: RawSearchResult[][]): RawSearchResult[] {
  const out: RawSearchResult[] = [];
  const maxLen = Math.max(0, ...arrays.map((a) => a.length));
  for (let i = 0; i < maxLen; i++) {
    for (const arr of arrays) {
      if (arr[i]) out.push(arr[i]);
    }
  }
  return out;
}

function normalizeForDedupe(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "")).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

// Filters out unfetchable/blocked/non-HTML results, de-duplicates, caps how
// many results a single domain can contribute (keeps sources diverse), and
// sorts reputable domains first.
function mergeAndFilterResults(all: RawSearchResult[], count: number): { url: string; snippet: string }[] {
  const seen = new Set<string>();
  const perDomainCount = new Map<string, number>();
  const filtered: (RawSearchResult & { score: number })[] = [];

  for (const r of all) {
    if (!r.url || !r.url.startsWith("http")) continue;
    let hostname = "";
    try {
      hostname = new URL(r.url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (isBlockedHost(hostname)) continue;
    if (looksLikeNonHtmlFile(r.url)) continue;

    const dedupeKey = normalizeForDedupe(r.url);
    if (seen.has(dedupeKey)) continue;

    const domainKey = hostname.replace(/^www\./, "");
    const domainCount = perDomainCount.get(domainKey) || 0;
    if (domainCount >= 2) continue;

    seen.add(dedupeKey);
    perDomainCount.set(domainKey, domainCount + 1);
    filtered.push({ ...r, url: applyDomainRewrite(r.url), score: reputationScore(hostname) });
  }

  filtered.sort((a, b) => b.score - a.score);

  return filtered.slice(0, count).map((r) => ({
    url: r.url,
    snippet: (r.snippet && r.snippet.trim()) || r.title || r.url,
  }));
}

// --- Fetch-with-byte-cap: reads the response body incrementally and stops
// once MAX_FETCH_BYTES is hit, instead of buffering an unbounded page ---
const MAX_FETCH_BYTES = Number(process.env.FANLUC_MAX_FETCH_MB) > 0 ? Number(process.env.FANLUC_MAX_FETCH_MB) * 1024 * 1024 : 30 * 1024 * 1024; // 30MB default

// ============================================================================
// Virtual docs sites (served from the local ./docs folder, no network):
// - https://fanluc.docs/     -> any web search whose query contains "fanluc"
// - https://mondk-msh.docs/  -> any web search whose query contains the word "mondk" or "msh"
// Each matching site gets its URL inserted FIRST in the results (the last real
// results are dropped so the result count stays the same). /api/fetch-url serves
// the pages from the docs folder.
// ============================================================================
const DOCS_VIRTUAL_HOST = "fanluc.docs";
const DOCS_VIRTUAL_URL = `https://${DOCS_VIRTUAL_HOST}/`;
const MONDK_MSH_VIRTUAL_HOST = "mondk-msh.docs";
const MONDK_MSH_VIRTUAL_URL = `https://${MONDK_MSH_VIRTUAL_HOST}/`;
const DOCS_MAX_CHARS = 40000;

const VIRTUAL_DOCS_SITES: { host: string; url: string; trigger: RegExp; snippet: string }[] = [
  {
    host: DOCS_VIRTUAL_HOST,
    url: DOCS_VIRTUAL_URL,
    trigger: /fanluc/i,
    snippet:
      "Official FANLUC docs (detailed interface/UI description, creator mondk, msh, connection guide) - fetch this URL to read them in full.",
  },
  {
    host: MONDK_MSH_VIRTUAL_HOST,
    url: MONDK_MSH_VIRTUAL_URL,
    trigger: /\b(?:mondk|msh)\b/i,
    snippet:
      "Official docs about the author mondk and the msh project (docs/mondk.md and docs/msh.md) - fetch this URL to read them in full.",
  },
];

function injectDocsResult(
  query: string,
  results: { url: string; snippet: string }[],
  maxCount: number
): { url: string; snippet: string }[] {
  const sites = VIRTUAL_DOCS_SITES.filter((site) => site.trigger.test(query || ""));
  if (sites.length === 0) return results;
  const rest = results.filter((r) => !sites.some((site) => r.url.toLowerCase().includes(site.host)));
  const keepCount = Math.max(1, maxCount - sites.length);
  const kept = rest.length > keepCount && maxCount > sites.length ? rest.slice(0, keepCount) : rest;
  return [...sites.map((site) => ({ url: site.url, snippet: site.snippet })), ...kept];
}

/** Reads one file from ./docs by short name (e.g. "mondk" -> mondk.md). */
async function readDocsFile(name: string): Promise<{ file: string; text: string } | null> {
  const docsDir = path.join(process.cwd(), "docs");
  let files: string[] = [];
  try {
    files = (await fs.promises.readdir(docsDir)).filter((f) => /\.(md|txt)$/i.test(f));
  } catch {
    return null;
  }
  const file =
    files.find((f) => f.toLowerCase() === name || f.toLowerCase() === `${name}.md`) ||
    files.find((f) => f.toLowerCase().includes(name));
  if (!file) return null;
  return { file, text: await fs.promises.readFile(path.join(docsDir, file), "utf-8") };
}

/** https://mondk-msh.docs/ -> both docs; /mondk or /msh -> a single doc. */
async function readMondkMshPage(pathname: string): Promise<{ title: string; text: string }> {
  let name = "";
  try {
    name = decodeURIComponent(pathname || "");
  } catch {
    name = pathname || "";
  }
  name = name.replace(/^\/+|\/+$/g, "").toLowerCase().replace(/\.md$/, "");
  const pages = ["mondk", "msh"];
  if (name && name !== "index") {
    if (!pages.includes(name)) {
      return {
        title: "Not found",
        text: `Page '${name}' not found. Available: ${pages.map((n) => MONDK_MSH_VIRTUAL_URL + n).join(", ")}`,
      };
    }
    const doc = await readDocsFile(name);
    if (!doc) return { title: "Not found", text: `docs/${name}.md was not found on this server.` };
    return { title: doc.file, text: doc.text.slice(0, DOCS_MAX_CHARS) };
  }
  const parts: string[] = [];
  for (const n of pages) {
    const doc = await readDocsFile(n);
    parts.push(`=== docs/${doc ? doc.file : n + ".md"} ===\n${doc ? doc.text.trim() : "(file not found)"}`);
  }
  return { title: "MONDK and MSH docs", text: parts.join("\n\n").slice(0, DOCS_MAX_CHARS) };
}

async function readVirtualDocsPage(pathname: string): Promise<{ title: string; text: string }> {
  const docsDir = path.join(process.cwd(), "docs");
  let files: string[] = [];
  try {
    files = (await fs.promises.readdir(docsDir)).filter((f) => /\.(md|txt)$/i.test(f));
  } catch {
    /* no docs dir */
  }
  let name = "";
  try {
    name = decodeURIComponent(pathname || "");
  } catch {
    name = pathname || "";
  }
  name = name.replace(/^\/+|\/+$/g, "").toLowerCase().replace(/\.md$/, "");
  const find = (n: string) =>
    files.find((f) => f.toLowerCase() === n || f.toLowerCase() === `${n}.md`) ||
    files.find((f) => f.toLowerCase().includes(n));
  const read = (f: string) => fs.promises.readFile(path.join(docsDir, f), "utf-8");

  if (!name || name === "index") {
    const ui = find("fanluc");
    const pages = ["fanluc", "guide", "mondk", "msh"].filter((n) => find(n));
    const index =
      "FANLUC docs index:\n" + pages.map((n) => `- ${DOCS_VIRTUAL_URL}${n === "fanluc" ? "" : n}`).join("\n") + "\n\n";
    const body = ui ? await read(ui) : "(fanluc ui doc not found)";
    return { title: "FANLUC docs", text: (index + body).slice(0, DOCS_MAX_CHARS) };
  }
  const file = find(name);
  if (!file) {
    return {
      title: "Not found",
      text: `Page '${name}' not found. Available: ${["fanluc", "guide", "mondk", "msh"].map((n) => DOCS_VIRTUAL_URL + (n === "fanluc" ? "" : n)).join(", ")}`,
    };
  }
  return { title: file, text: (await read(file)).slice(0, DOCS_MAX_CHARS) };
}

async function fetchWithByteLimit(
  url: string,
  signal: AbortSignal,
  maxBytes: number
): Promise<{ ok: boolean; status: number; contentType: string; body: string }> {
  const response = await fetch(url, {
    signal,
    redirect: "follow",
    headers: {
      "User-Agent": DESKTOP_UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  const contentType = response.headers.get("content-type") || "";

  if (!response.body) {
    const text = await response.text();
    return { ok: response.ok, status: response.status, contentType, body: text.slice(0, maxBytes) };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    body += decoder.decode(value, { stream: true });
    if (received >= maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      break;
    }
  }
  body += decoder.decode();
  return { ok: response.ok, status: response.status, contentType, body };
}

function fallbackCleanHtml(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(nav|header|footer|aside|form|button|select|figure|figcaption)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decodeHtmlEntities(stripped);
}

// Extracts the actual article content from a raw HTML page. Tries Mozilla's
// Readability algorithm first (the same one behind Firefox Reader View -
// strips nav/ads/footers/comments and keeps just the article body); falls
// back to tag-stripping (still boilerplate-tag-aware) if Readability can't
// find an article on the page (e.g. it's a listing/home page, not an article).
function extractReadableContent(
  html: string,
  url: string
): { title: string; text: string; usedReadability: boolean } {
  try {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;
    doc.querySelectorAll("script, style, noscript, iframe, svg, form").forEach((el) => el.remove());

    const reader = new Readability(doc, { charThreshold: 200 });
    const article = reader.parse();

    if (article && article.textContent && article.textContent.trim().length > 150) {
      const cleanText = article.textContent.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      return { title: article.title || "", text: cleanText, usedReadability: true };
    }
  } catch (err: any) {
    console.warn("Readability extraction failed, falling back:", err?.message);
  }

  return { title: "", text: fallbackCleanHtml(html), usedReadability: false };
}


// ============================================================================
// SearXNG — optional search engine, Yahoo JP / Bing / DDG automatic fallback
// Config: SEARXNG_URL (or SEARXNG) env var
// ============================================================================
const SEARXNG_URL = (process.env.SEARXNG_URL || process.env.SEARXNG || "").replace(/\/$/, "");

async function searchSearXNG(query: string, count: number, categories: "general" | "images" = "general", baseUrl: string = SEARXNG_URL): Promise<RawSearchResult[]> {
  const results: RawSearchResult[] = [];
  if (!baseUrl || !baseUrl.startsWith("http")) return results;
  try {
    const params = new URLSearchParams({ q: query.trim(), format: "json", categories, pageno: "1" });
    const url = `${baseUrl}/search?${params.toString()}`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": DESKTOP_UA,
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) {
      return results;
    }
    const j: any = await resp.json();
    const raw = Array.isArray(j.results) ? j.results : [];
    for (const x of raw) {
      if (results.length >= count * 2) break;
      if (categories === "images") {
        const title = (x.title || x.content || "").toString();
        const url = (x.url || x.img_src || "").toString();
        const img_src = (x.img_src || x.url || "").toString();
        const thumb = (x.thumbnail_src || x.img_src || x.thumbnail || "").toString();
        if (!img_src && !url) continue;
        results.push({
          url: url || img_src,
          title,
          snippet: title,
          engine: "searxng-images",
          _img_src: img_src,
          _thumb: thumb,
        } as any);
      } else {
        const title = (x.title || "").toString();
        const url = (x.url || "").toString();
        const snippet = (x.content || x.title || "").toString();
        if (!url || !url.startsWith("http")) continue;
        results.push({ url, title, snippet, engine: "searxng" });
      }
    }
  } catch (_err) {
    // Silently fallback to Yahoo / Multi-engine
  }
  return results;
}


// ---- User-supplied URLs (from browser settings): must be public http(s) ----
function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  if (net.isIPv4(v)) {
    const [a, b] = v.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}
async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http/https URLs are allowed");
  if (process.env.ALLOW_PRIVATE_URLS !== "0") return u; // self-host default: localhost is fine
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Private/local hosts are not allowed");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  for (const a of addrs) if (isPrivateIp(a.address)) throw new Error("Private/local hosts are not allowed");
  return u;
}
async function resolveSearxUrl(req: any): Promise<string> {
  const raw = String(req.body?.searxngUrl || req.headers["x-searxng-url"] || "").trim();
  if (!raw) return SEARXNG_URL;
  try {
    const u = await assertPublicUrl(raw);
    return (u.origin + u.pathname).replace(/\/$/, "");
  } catch (e: any) {
    console.warn("[SearXNG] user URL rejected:", e?.message);
    return SEARXNG_URL;
  }
}

async function searchSearXNGGeneral(query: string, count: number): Promise<RawSearchResult[]> {
  return searchSearXNG(query, count, "general");
}

// ============================================================================
// Image search helpers (SearXNG categories=images) + image proxy
// ============================================================================
interface ImageResult {
  title: string;
  src: string;
  thumb: string;
  page: string;
}

// ============================================================================
// MCP — file-based config (mcp.json), server.ts as bridge
// Format: Claude Code style { "mcpServers": { name: {type, command, args, url, headers, env, enabled} } }
// Also supports opencode style { "mcp": { ... } } / { "mcp": { "servers": { ... } } }
// Web can't spawn processes, so server.ts bridges via MCP SDK
// Security: only read config from file on server; never accept command/url from client
// ============================================================================
function stripJsonc(s: string): string {
  // Remove // and /* */ comments but keep them inside strings (e.g. "https://...")
  return s.replace(/("(?:\\.|[^"\\])*")|\/\/.*$|\/\*[\s\S]*?\*\//gm, (_m, str) => str ?? "");
}
function isLocalRequest(req: any): boolean {
  const ip = String(req.socket?.remoteAddress || "");
  const loop = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  return loop && !req.headers["x-forwarded-for"]; // tunnels (ngrok) add x-forwarded-for
}
function mcpAdminGuard(req: any, res: any, next: any) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return next(); // no ADMIN_TOKEN set = open (personal instance), same as before
  if (req.headers["x-admin-token"] === token) return next();
  return res.status(403).json({ error: "Admin only: send header x-admin-token matching ADMIN_TOKEN." });
}
function resolveEnvVars(str: string): string {
  if (typeof str !== "string") return str;
  return str.replace(/\$\{([^}]+)\}/g, (_, name) => {
    const n = String(name).trim();
    if (n === "WORKSPACE") return getWorkspace(); // current folder chosen in the UI
    return process.env[n] ?? "";
  });
}
function resolveEnvObject(obj: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!obj || typeof obj !== "object") return obj;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === "string" ? resolveEnvVars(v) : v;
  }
  return out;
}

type McpEntry = {
  client: Client | null;
  tools: any[];
  status: "connected" | "failed" | "disabled" | "connecting";
  error?: string;
  config: any;
  type: string;
};

const mcp = new Map<string, McpEntry>();

function normalizeMcpType(t: string): "stdio" | "http" {
  const low = (t || "").toLowerCase();
  if (low === "http" || low === "remote" || low === "streamablehttp" || low === "sse") return "http";
  return "stdio";
}

async function connectMcp(name: string, cfg: any) {
  const explicitlyDisabled = cfg.enabled === false || cfg.disabled === true;
  if (explicitlyDisabled) {
    mcp.set(name, { client: null, tools: [], status: "disabled", config: cfg, type: normalizeMcpType(cfg.type) });
    return;
  }
  const type = normalizeMcpType(cfg.type || (cfg.url ? "http" : "stdio"));
  const entry: McpEntry = { client: null, tools: [], status: "connecting", config: cfg, type };
  mcp.set(name, entry);
  try {
    let client: Client;
    if (type === "http") {
      const rawUrl = cfg.url;
      if (!rawUrl) throw new Error("Missing url for http/remote MCP server");
      const resolvedUrl = new URL(resolveEnvVars(String(rawUrl)));
      const headers = resolveEnvObject(cfg.headers) || {};
      const mk = () => new Client({ name: "fanluc", version: "1.0.0" } as any, { capabilities: {} } as any);
      try {
        client = mk();
        await client.connect(new StreamableHTTPClientTransport(resolvedUrl, { requestInit: { headers } } as any), { timeout: 30000 } as any);
      } catch (e1: any) {
        // Older servers only speak the legacy "SSE" transport: try that before giving up.
        try {
          client = mk();
          await client.connect(new SSEClientTransport(resolvedUrl, { requestInit: { headers } } as any), { timeout: 30000 } as any);
        } catch {
          throw e1;
        }
      }
    } else {
      let command: string | undefined = cfg.command;
      let args: string[] = Array.isArray(cfg.args) ? cfg.args : [];
      const userEnv = resolveEnvObject(cfg.env || cfg.environment) || {};
      if (Array.isArray(command)) {
        args = (command as string[]).slice(1);
        command = (command as string[])[0];
      }
      if (!command) throw new Error("Missing command for stdio/local MCP server");
      // Allow "npx -y pkg" typed into the command box
      let resolvedCommand = resolveEnvVars(String(command)).trim();
      let resolvedArgs = args.map((a) => resolveEnvVars(String(a)));
      if (!resolvedArgs.length && /\s/.test(resolvedCommand)) {
        const parts = resolvedCommand.split(/\s+/);
        resolvedCommand = parts[0];
        resolvedArgs = parts.slice(1);
      }
      // Child gets the real environment (PATH, proxies, ...) minus this app's own secrets.
      const baseEnv: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (typeof v === "string" && !["GEMINI_API_KEY", "TOKEN", "ADMIN_TOKEN", "ACCESS_TOKEN"].includes(k)) baseEnv[k] = v;
      }
      const cwd = cfg.cwd ? resolveEnvVars(String(cfg.cwd)) : getWorkspace();
      const transport = new StdioClientTransport({
        command: resolvedCommand,
        args: resolvedArgs,
        env: { ...baseEnv, ...userEnv },
        cwd,
        stderr: "pipe",
      } as any);
      let errTail = "";
      (transport as any).stderr?.on?.("data", (d: Buffer) => {
        errTail = (errTail + d.toString()).slice(-1500);
      });
      client = new Client({ name: "fanluc", version: "1.0.0" } as any, { capabilities: {} } as any);
      try {
        // first `npx -y` run may download packages: allow 2 minutes
        await client.connect(transport, { timeout: 120000 } as any);
      } catch (e: any) {
        const tail = errTail.trim();
        throw new Error(`${e?.message || e}${tail ? `\n--- server stderr ---\n${tail}` : ""}`);
      }
    }
    const toolsRes: any = await client.listTools();
    const tools = Array.isArray(toolsRes?.tools) ? toolsRes.tools : [];
    const truncated = tools.map((t: any) => ({
      ...t,
      description: typeof t.description === "string" ? t.description : t.description,
    }));
    mcp.set(name, { client, tools: truncated, status: "connected", config: cfg, type });
    console.log(`[MCP] ${name} connected — ${truncated.length} tools`);
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.warn(`[MCP] ${name} failed:`, msg);
    mcp.set(name, { client: null as any, tools: [], status: "failed", error: msg, config: cfg, type });
  }
}

function loadMcpConfigSync(): Record<string, any> {
  const candidates = [
    path.join(process.cwd(), "mcp.json"),
    path.join(process.cwd(), "mcp.jsonc"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf-8");
        const cleaned = stripJsonc(raw);
        const j = JSON.parse(cleaned);
        if (j.mcpServers && typeof j.mcpServers === "object") return j.mcpServers;
        if (j.mcp && j.mcp.servers && typeof j.mcp.servers === "object") return j.mcp.servers;
        if (j.mcp && typeof j.mcp === "object" && !j.mcp.servers) {
          const maybe = j.mcp;
          const vals = Object.values(maybe) as any[];
          if (vals.length && vals.every((v: any) => v && typeof v.type === "string")) return maybe;
        }
        const topVals = Object.values(j) as any[];
        if (topVals.length && topVals.every((v: any) => v && typeof v.type === "string")) return j;
        return {};
      }
    } catch (e) {
      console.warn(`Failed to load MCP config from ${p}:`, e);
    }
  }
  return {};
}

async function initMcpFromFile() {
  const cfgMap = loadMcpConfigSync();
  const entries = Object.entries(cfgMap);
  if (entries.length === 0) {
    console.log("[MCP] no mcp.json found or empty — skipping MCP init");
    return;
  }
  console.log(`[MCP] loading ${entries.length} server(s) from mcp.json`);
  await Promise.all(entries.map(([name, cfg]) => connectMcp(name, cfg))); // in parallel: slow npx starts don't block each other
}

function getMcpToolsForModel(): any[] {
  const out: any[] = [];
  for (const [server, entry] of mcp.entries()) {
    if (entry.status !== "connected") continue;
    for (const t of entry.tools) {
      out.push({
        server,
        name: `${server}_${t.name}`,
        originalName: t.name,
        description: t.description || "",
        inputSchema: t.inputSchema,
      });
    }
  }
  return out;
}


async function startServer() {
  const app = express();
  const portArgIdx = process.argv.indexOf("--port");
  const cliPort = portArgIdx !== -1 && process.argv[portArgIdx + 1] ? Number(process.argv[portArgIdx + 1]) : null;
  const PORT = cliPort || (process.env.APP_PORT ? Number(process.env.APP_PORT) : 3000);

  app.use(express.json({ limit: "2gb" }));

  // No sandbox in this edition => the API only answers requests coming from this machine
  // (loopback + Host header check against DNS-rebinding). ALLOW_REMOTE_EXEC=1 turns this off.
  app.use("/api", (req, res, next) => (req.path === "/health" ? next() : requireLocal(req, res, next)));

  // Stdio MCP servers that use ${WORKSPACE} must restart when the user picks another folder.
  onWorkspaceChange(() => {
    for (const [name, entry] of mcp.entries()) {
      if (entry.status === "disabled") continue;
      // The Colab bridge is paired with a browser tab by token; restarting it would break that pairing.
      if (/colab-mcp|StudioMCP|Roblox.mcp\.bat/i.test(JSON.stringify(entry.config || {}))) continue;
      if (JSON.stringify(entry.config || {}).includes("${WORKSPACE}") || (entry.type === "stdio" && !entry.config?.cwd)) {
        const old = entry.client;
        connectMcp(name, entry.config).finally(() => {
          try {
            old?.close();
          } catch {}
        });
      }
    }
  });

  // Init MCP servers from mcp.json (non-blocking, log errors)
  initMcpFromFile().catch((e) => console.warn("[MCP] init failed:", e));

  // API Proxy endpoint to solve CORS issues with ngrok / custom REST APIs (Google Colab, Kaggle, Local)
  app.post("/api/proxy-chat", async (req, res) => {
    try {
      const { apiUrl, apiKey, body, customHeaders } = req.body;

      if (!apiUrl) {
        return res.status(400).json({ error: "Missing apiUrl parameter" });
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
        "User-Agent": "fanluc/2.4.1",
        "Authorization": `Bearer ${apiKey || ""}`,
        ...(customHeaders || {}),
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 300 second (5 min) timeout

      const response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const responseText = await response.text();
        return res.status(response.status).send(responseText);
      }

      if (body?.stream && response.body) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
        } catch (streamErr) {
          console.warn("Proxy stream pipe interrupted:", streamErr);
        } finally {
          res.end();
        }
        return;
      }

      const responseText = await response.text();
      try {
        const data = JSON.parse(responseText);
        return res.json(data);
      } catch {
        return res.send(responseText);
      }
    } catch (error: any) {
      console.error("Proxy error:", error);
      if (error?.name === "AbortError") {
        return res.status(504).json({
          error: "API response timed out (>5 min) or instance disconnected.",
        });
      }
      return res.status(500).json({ error: error?.message || "Internal Proxy Error" });
    }
  });

  // Web Search endpoint — tuned for running on the user's own machine.
  // Engines (parallel, each with a timeout + health tracking): SearXNG (optional),
  // Bing (this PC's language), Mojeek, Wikipedia, Yahoo JP (DuckDuckGo removed: captcha-walls scrapers). Results are fused with
  // reciprocal-rank fusion, filtered, cached for 10 min. Route name kept for frontend compat.
  app.post("/api/yahoo-search", async (req, res) => {
    try {
      const { query, count = 7 } = req.body;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Missing query parameter" });
      }
      const maxCount = Math.min(15, Math.max(1, parseInt(count) || 7));
      const searxUrl = await resolveSearxUrl(req);
      const key = `web:${LOCALE}:${searxUrl}:${query.toLowerCase().trim()}:${maxCount}`;

      const payload = await cached(
        key,
        10 * 60 * 1000,
        async () => {
          const per = Math.min(20, maxCount + 6);
          const lists = await raceUntilEnough<RawSearchResult>(
            [
              searxUrl ? runEngine("searxng", () => searchSearXNG(query, per, "general", searxUrl), 4000) : Promise.resolve([] as RawSearchResult[]),
              runEngine("bing", () => searchBingLocal(query, per) as Promise<RawSearchResult[]>, 4000),
              runEngine("mojeek", () => searchMojeek(query, per) as Promise<RawSearchResult[]>, 4000),
              runEngine("wikipedia", () => searchWikipedia(query, 5) as Promise<RawSearchResult[]>, 4000),
              runEngine("yahoo", () => searchYahooJP(query, per), 4000),
            ],
            (c) => c.reduce((n, a) => n + a.length, 0) >= maxCount,
            4500
          );
          const fused = fuseResults(lists as any) as RawSearchResult[];
          let results = mergeAndFilterResults(fused, maxCount);
          if (results.length === 0) results = fused.slice(0, maxCount).map((r) => ({ url: r.url, snippet: r.snippet || r.title || r.url }));
          results = injectDocsResult(query, results, maxCount);
          const names = ["searxng", "bing", "mojeek", "wikipedia", "yahoo"].filter((_, i) => lists[i].length > 0);
          const formattedText =
            results.length > 0
              ? `${results.length} results:\n` + results.map((r) => `${r.url}: ${r.snippet}`).join("\n")
              : `0 results:\n(no results found for "${query}")`;
          return { count: results.length, results, formattedText, engine: names.join("+") || "none" };
        },
        (v) => v.count > 0
      );
      return res.json(payload);
    } catch (error: any) {
      console.error("Web search error:", error);
      return res.status(500).json({ error: error?.message || "Web search failed" });
    }
  });

  // Which search engines are healthy right now (debug / settings panel)
  app.get("/api/search-status", (_req, res) => {
    res.json({ locale: LOCALE, searxng: SEARXNG_URL || null, engines: engineStatus() });
  });

  // Dedicated SearXNG search (optional direct access)
  app.post("/api/searxng-search", async (req, res) => {
    try {
      const { query, count = 7, categories = "general" } = req.body;
      if (!query || typeof query !== "string") return res.status(400).json({ error: "Missing query" });
      const maxCount = Math.min(15, Math.max(1, parseInt(count) || 7));
      const cat = categories === "images" ? "images" : "general";
      const raw = await searchSearXNG(query, maxCount, cat as any, await resolveSearxUrl(req));
      let results: any[] = [];
      if (cat === "images") {
        // Return image-mapped results
        const filtered = raw.slice(0, maxCount).map((r: any) => ({
          title: r.title,
          src: (r as any)._img_src || r.url,
          thumb: (r as any)._thumb || (r as any)._img_src || r.url,
          page: r.url,
          url: r.url,
        }));
        return res.json({ count: filtered.length, results: filtered, formattedText: filtered.length ? `${filtered.length} images:${filtered.map((x:any)=>" "+x.src).join(",")}` : "0 images" });
      } else {
        results = mergeAndFilterResults(raw, maxCount);
        if (results.length === 0) results = raw.slice(0, maxCount).map((r) => ({ url: r.url, snippet: r.snippet }));
        const formattedText = results.length ? `${results.length} results:\n` + results.map((r:any)=>`${r.url}: ${r.snippet}`).join("\n") : `0 results\n(no results)`;
        return res.json({ count: results.length, results, formattedText });
      }
    } catch (e:any){ return res.status(500).json({error:e?.message});}
  });

  // Image search: works WITHOUT SearXNG (Bing + Wikimedia Commons +
  // Openverse). SearXNG is only an extra source when SEARXNG_URL / the settings URL is set.
  app.post("/api/image-search", async (req, res) => {
    try {
      const { query, count = 6 } = req.body;
      if (!query || typeof query !== "string") return res.status(400).json({ error: "Missing query" });
      const maxCount = Math.min(12, Math.max(1, parseInt(count) || 6));
      const hits = await searchImages(query, maxCount, await resolveSearxUrl(req));
      const images: ImageResult[] = hits.map((h) => ({ title: h.title || query, src: h.src, thumb: h.thumb, page: h.page }));
      const formattedText = images.length ? `Showing ${images.length} images for "${query}"` : `No images found for "${query}"`;
      return res.json({ count: images.length, images, formattedText });
    } catch (e: any) {
      console.error("Image search error:", e);
      return res.status(500).json({ error: e?.message || "Image search failed" });
    }
  });

  // Image proxy (to avoid hotlink blocking)
  app.get("/api/image-proxy", async (req, res) => {
    try {
      const url = String(req.query.url || "");
      if (!url || !url.startsWith("http")) return res.status(400).send("Missing url");
      const parsed = new URL(url);
      if (isBlockedHost(parsed.hostname)) return res.status(403).send("Blocked host");
      let resp: Response | null = null;
      let cur = url;
      for (let hop = 0; hop < 4; hop++) {
        const h = new URL(cur).hostname;
        if (isBlockedHost(h)) return res.status(403).send("Blocked host");
        resp = await fetch(cur, { redirect: "manual", headers: { "User-Agent": DESKTOP_UA, "Accept": "image/*,*/*", "Referer": new URL(cur).origin + "/" } } as any);
        const loc = resp.headers.get("location");
        if (resp.status >= 300 && resp.status < 400 && loc) { cur = new URL(loc, cur).toString(); resp = null; continue; }
        break;
      }
      if (!resp) return res.status(508).send("Too many redirects");
      if (!resp.ok) return res.status(resp.status).send("Fetch failed");
      const ct = resp.headers.get("content-type") || "image/jpeg";
      if (!ct.startsWith("image/")) return res.status(415).send("Not an image");
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=86400");
      if (resp.body) {
        const reader = resp.body.getReader();
        // stream
        res.flushHeaders?.();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      } else {
        const buf = Buffer.from(await resp.arrayBuffer());
        res.send(buf);
      }
    } catch (e:any){ return res.status(500).send(e?.message); }
  });

  // ==========================================================================
  // MCP endpoints
  // Security: config only from file; client never sends command/url
  // ==========================================================================
  app.get("/api/mcp/status", (_req, res) => {
    const list = [...mcp.entries()].map(([name, v]) => ({
      name,
      type: v.type, // stdio / http
      status: v.status, // connected / failed / disabled / connecting
      tools: v.tools,
      toolCount: v.tools.length,
      error: v.error || null,
      command: v.config?.command || "",
      args: Array.isArray(v.config?.args) ? v.config.args.join(" ") : (v.config?.args || ""),
      url: v.config?.url || "",
      headers: v.config?.headers || undefined,
    }));
    // Also include tools for model (prefixed)
    const modelTools = getMcpToolsForModel();
    res.json({ servers: list, modelTools, count: list.length });
  });

  app.get("/api/mcp/tools", (_req, res) => {
    // For model injection: only enabled connected servers, truncated
    res.json({ tools: getMcpToolsForModel() });
  });

  app.post("/api/mcp/call", async (req, res) => {
    try {
      const { server, tool, args, arguments: altArgs } = req.body || {};
      const toolName = tool;
      const toolArgs = args ?? altArgs ?? {};
      if (!server || !toolName) return res.status(400).json({ error: "Missing server or tool" });
      const entry = mcp.get(server);
      if (!entry) return res.status(404).json({ error: `MCP server "${server}" not found` });
      if (entry.status !== "connected" || !entry.client) return res.status(400).json({ error: `MCP server "${server}" not connected (${entry.status})${entry.error ? ": "+entry.error : ""}` });
      // Validate tool exists on this server (or with prefix)
      const actualTool = toolName.includes("_") && toolName.startsWith(server + "_")
        ? toolName.slice(server.length + 1)
        : toolName;
      const callOpts = { timeout: 180000 } as any;
      let result: any;
      try {
        result = await entry.client.callTool({ name: actualTool, arguments: toolArgs }, undefined, callOpts);
      } catch (err: any) {
        // server process died / connection dropped: reconnect once and retry
        if (/closed|not connected|EPIPE|terminated|ECONNRESET|fetch failed/i.test(String(err?.message || err))) {
          await connectMcp(server, entry.config);
          const again = mcp.get(server);
          if (again?.status === "connected" && again.client) {
            result = await again.client.callTool({ name: actualTool, arguments: toolArgs }, undefined, callOpts);
          } else throw err;
        } else throw err;
      }
      return res.json(result);
    } catch (e:any){
      console.error("MCP call error:", e);
      return res.status(500).json({ error: e?.message || "MCP call failed" });
    }
  });

  // ---- Browser-configured MCP (http only, stateless: connect per request) ----
  async function withUserMcp<T>(cfg: any, fn: (c: Client) => Promise<T>): Promise<T> {
    const u = await assertPublicUrl(String(cfg?.url || ""));
    const headers: Record<string, string> = {};
    if (cfg?.headers && typeof cfg.headers === "object") {
      for (const [k, v] of Object.entries(cfg.headers)) if (typeof v === "string" && /^[\w-]+$/.test(k)) headers[k] = v;
    }
    const transport = new StreamableHTTPClientTransport(u, { requestInit: { headers } } as any);
    const client = new Client({ name: "fanluc", version: "1.0.0" } as any, { capabilities: {} } as any);
    let timer: any;
    try {
      const run = (async () => { await client.connect(transport); return fn(client); })();
      return await Promise.race([run, new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("MCP timeout (20s)")), 20000); })]);
    } finally {
      clearTimeout(timer);
      try { await client.close(); } catch {}
    }
  }

  app.post("/api/mcp/user/probe", async (req, res) => {
    const list = Array.isArray(req.body?.servers) ? req.body.servers.slice(0, 8) : [];
    const out = await Promise.all(list.map(async (s: any) => {
      const name = String(s?.name || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
      try {
        const tools = await withUserMcp(s, async (c) => { const r: any = await c.listTools(); return Array.isArray(r?.tools) ? r.tools : []; });
        const t = tools.map((x: any) => ({ ...x, description: typeof x.description === "string" ? x.description : x.description }));
        return { name, type: "http", status: "connected", tools: t, toolCount: t.length, error: null, source: "browser" };
      } catch (e: any) {
        return { name, type: "http", status: "failed", tools: [], toolCount: 0, error: e?.message || String(e), source: "browser" };
      }
    }));
    res.json({ servers: out });
  });

  app.post("/api/mcp/user/call", async (req, res) => {
    try {
      const { server, tool, args } = req.body || {};
      if (!server || !tool) return res.status(400).json({ error: "Missing server or tool" });
      const name = String(server.name || "");
      const actual = String(tool).startsWith(name + "_") ? String(tool).slice(name.length + 1) : String(tool);
      const r = await withUserMcp(server, (c) => c.callTool({ name: actual, arguments: args && typeof args === "object" ? args : {} }));
      return res.json(r);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "MCP call failed" });
    }
  });

  app.post("/api/mcp/reconnect", mcpAdminGuard, async (req, res) => {
    try {
      const { server } = req.body || {};
      if (!server) return res.status(400).json({ error: "Missing server" });
      const cfgMap = loadMcpConfigSync();
      const cfg = cfgMap[server];
      if (!cfg) return res.status(404).json({ error: "Server not found in mcp.json" });
      // Close old client if exists
      const old = mcp.get(server);
      try { await (old?.client as any)?.close?.(); } catch {}
      await connectMcp(server, cfg);
      const entry = mcp.get(server)!;
      return res.json({ name: server, status: entry.status, toolCount: entry.tools.length, error: entry.error || null });
    } catch (e:any){ return res.status(500).json({ error: e?.message });}
  });

  app.post("/api/mcp/toggle", mcpAdminGuard, async (req, res) => {
    try {
      const { server, enabled } = req.body || {};
      if (!server) return res.status(400).json({ error: "Missing server" });
      const cfgMap = loadMcpConfigSync();
      // If server not in file, check memory
      let cfg = cfgMap[server];
      if (!cfg) {
        const mem = mcp.get(server);
        if (!mem) return res.status(404).json({ error: "Server not found" });
        cfg = mem.config;
      }
      const newEnabled = enabled !== undefined ? !!enabled : mcp.get(server)?.status === "disabled";
      const newCfg = { ...cfg, enabled: newEnabled, disabled: !newEnabled };
      if (newEnabled) {
        await connectMcp(server, newCfg);
      } else {
        const old = mcp.get(server);
        try { await (old?.client as any)?.close?.(); } catch {}
        mcp.set(server, { client: null, tools: [], status: "disabled", config: newCfg, type: normalizeMcpType(newCfg.type) });
      }
      // Persist back to mcp.json? For now only in-memory + file remains unchanged — tell client
      // Optionally write back: disabled servers keep enabled:false in memory only.
      const entry = mcp.get(server)!;
      return res.json({ name: server, status: entry.status, enabled: newEnabled });
    } catch (e:any){ return res.status(500).json({ error: e?.message });}
  });

  app.post("/api/mcp/add", mcpAdminGuard, async (req, res) => {
    try {
      const { name, type, command, args, url, headers, env, enabled = true } = req.body || {};
      if (!name || typeof name !== "string") return res.status(400).json({ error: "Missing name" });
      const cleanName = name.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
      if (!cleanName) return res.status(400).json({ error: "Invalid name" });
      // Security: only allow server-side file write; validate inputs
      const newCfg: any = { type: type || (url ? "http" : "stdio"), enabled: !!enabled };
      if (newCfg.type === "http" || newCfg.type === "remote") {
        if (!url || !String(url).startsWith("http")) return res.status(400).json({ error: "Invalid url for http server" });
        newCfg.url = String(url);
        if (headers && typeof headers === "object") newCfg.headers = headers;
      } else {
        if (!command || typeof command !== "string") return res.status(400).json({ error: "Missing command for stdio server" });
        newCfg.command = String(command);
        if (Array.isArray(args) && args.length) newCfg.args = args.map(String);
        else if (typeof args === "string" && args.trim()) newCfg.args = String(args).trim().split(/\s+/);
        if (env && typeof env === "object") newCfg.env = env;
      }
      // Persist to mcp.json
      const mcpPath = path.join(process.cwd(), "mcp.json");
      let existing: any = {};
      try {
        if (fs.existsSync(mcpPath)) {
          const raw = fs.readFileSync(mcpPath, "utf-8");
          const j = JSON.parse(stripJsonc(raw));
          if (j.mcpServers) existing = j.mcpServers;
          else if (j.mcp && j.mcp.servers) existing = j.mcp.servers;
          else if (j.mcp && typeof j.mcp === "object") existing = j.mcp;
          else existing = j;
        }
      } catch (e: any) {
        return res.status(500).json({ error: "mcp.json is invalid, refusing to overwrite: " + (e?.message || e) });
      }
      existing[cleanName] = newCfg;
      const toWrite = { mcpServers: existing };
      fs.writeFileSync(mcpPath, JSON.stringify(toWrite, null, 2));
      await connectMcp(cleanName, newCfg);
      const entry = mcp.get(cleanName)!;
      return res.json({ name: cleanName, status: entry.status, toolCount: entry.tools.length, error: entry.error || null });
    } catch (e:any){ return res.status(500).json({ error: e?.message });}
  });

  app.post("/api/mcp/edit", mcpAdminGuard, async (req, res) => {
    try {
      const { oldName, name, type, command, args, url, headers, env, enabled = true } = req.body || {};
      if (!oldName || typeof oldName !== "string") return res.status(400).json({ error: "Missing oldName" });
      if (!name || typeof name !== "string") return res.status(400).json({ error: "Missing name" });
      const cleanOldName = oldName.trim();
      const cleanName = name.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
      if (!cleanName) return res.status(400).json({ error: "Invalid name" });

      const newCfg: any = { type: type || (url ? "http" : "stdio"), enabled: !!enabled };
      if (newCfg.type === "http" || newCfg.type === "remote") {
        if (!url || !String(url).startsWith("http")) return res.status(400).json({ error: "Invalid url for http server" });
        newCfg.url = String(url);
        if (headers && typeof headers === "object") newCfg.headers = headers;
      } else {
        if (!command || typeof command !== "string") return res.status(400).json({ error: "Missing command for stdio server" });
        newCfg.command = String(command);
        if (Array.isArray(args) && args.length) newCfg.args = args.map(String);
        else if (typeof args === "string" && args.trim()) newCfg.args = String(args).trim().split(/\s+/);
        if (env && typeof env === "object") newCfg.env = env;
      }

      const mcpPath = path.join(process.cwd(), "mcp.json");
      let existing: any = {};
      try {
        if (fs.existsSync(mcpPath)) {
          const raw = fs.readFileSync(mcpPath, "utf-8");
          const j = JSON.parse(stripJsonc(raw));
          if (j.mcpServers) existing = j.mcpServers;
          else if (j.mcp && j.mcp.servers) existing = j.mcp.servers;
          else if (j.mcp && typeof j.mcp === "object") existing = j.mcp;
          else existing = j;
        }
      } catch (e: any) {
        return res.status(500).json({ error: "mcp.json is invalid, refusing to overwrite: " + (e?.message || e) });
      }

      // Close old client if name changed or reconnecting
      if (cleanOldName !== cleanName || mcp.has(cleanOldName)) {
        delete existing[cleanOldName];
        const old = mcp.get(cleanOldName);
        try { await (old?.client as any)?.close?.(); } catch {}
        mcp.delete(cleanOldName);
      }

      existing[cleanName] = newCfg;
      fs.writeFileSync(mcpPath, JSON.stringify({ mcpServers: existing }, null, 2));

      if (newCfg.enabled) {
        await connectMcp(cleanName, newCfg);
      } else {
        mcp.set(cleanName, { client: null, tools: [], status: "disabled", config: newCfg, type: normalizeMcpType(newCfg.type) });
      }

      const entry = mcp.get(cleanName);
      return res.json({ name: cleanName, status: entry?.status || "disabled", toolCount: entry?.tools?.length || 0, error: entry?.error || null });
    } catch (e: any) { return res.status(500).json({ error: e?.message }); }
  });

  app.post("/api/mcp/delete", mcpAdminGuard, async (req, res) => {
    try {
      const { name } = req.body || {};
      if (!name || typeof name !== "string") return res.status(400).json({ error: "Missing name" });
      const cleanName = name.trim();

      const mcpPath = path.join(process.cwd(), "mcp.json");
      let existing: any = {};
      if (fs.existsSync(mcpPath)) {
        try {
          const raw = fs.readFileSync(mcpPath, "utf-8");
          const j = JSON.parse(stripJsonc(raw));
          if (j.mcpServers) existing = j.mcpServers;
          else if (j.mcp && j.mcp.servers) existing = j.mcp.servers;
          else if (j.mcp && typeof j.mcp === "object") existing = j.mcp;
          else existing = j;
        } catch {}
      }

      delete existing[cleanName];
      fs.writeFileSync(mcpPath, JSON.stringify({ mcpServers: existing }, null, 2));

      const old = mcp.get(cleanName);
      try { await (old?.client as any)?.close?.(); } catch {}
      mcp.delete(cleanName);

      return res.json({ success: true });
    } catch (e: any) { return res.status(500).json({ error: e?.message }); }
  });


  // Fetch URL endpoint - extracts clean article text via Readability instead
  // of dumping the whole stripped-tag page (nav/ads/footer/comment junk).
  app.post("/api/fetch-url", async (req, res) => {
    const errorFallback = "you entered an incorrect URL, are missing characters, or the website no longer exists";
    try {
      const { url, length = 1100 } = req.body;
      if (!url || typeof url !== "string") {
        return res.json({
          url: url || "",
          text: errorFallback,
          formattedText: errorFallback,
        });
      }

      // Extract valid URL even if AI attached trailing titles, colons or spaces
      const urlMatch = url.match(/https?:\/\/[^\s"']+/);
      let targetUrl = urlMatch ? urlMatch[0] : url.trim();
      if (/^(?:fanluc|mondk-msh)\.docs(?:[\/?#]|$)/i.test(targetUrl)) targetUrl = "https://" + targetUrl;

      try {
        new URL(targetUrl);
      } catch {
        return res.json({
          url: targetUrl,
          text: errorFallback,
          formattedText: errorFallback,
        });
      }

      targetUrl = applyDomainRewrite(targetUrl);

      let hostname = "";
      try {
        hostname = new URL(targetUrl).hostname.toLowerCase();
      } catch {
        // already validated above, shouldn't happen
      }

      if (hostname === DOCS_VIRTUAL_HOST || hostname === MONDK_MSH_VIRTUAL_HOST) {
        const pathname = new URL(targetUrl).pathname;
        const doc =
          hostname === MONDK_MSH_VIRTUAL_HOST ? await readMondkMshPage(pathname) : await readVirtualDocsPage(pathname);
        return res.json({
          url: targetUrl,
          title: doc.title,
          text: doc.text,
          formattedText: `fetched url: ${targetUrl}\ntitle: ${doc.title}\ntext: ${doc.text}`,
        });
      }

      if (isBlockedHost(hostname)) {
        const blockedMsg = `This site (${hostname}) blocks automated crawling or requires login, so its content cannot be reliably extracted. Try a different, publicly accessible source instead.`;
        return res.json({
          url: targetUrl,
          text: blockedMsg,
          formattedText: `fetched url: ${targetUrl}\ntext: ${blockedMsg}`,
        });
      }

      if (looksLikeNonHtmlFile(targetUrl)) {
        const fileMsg = "This URL points to a non-HTML file (document, image, archive, or media) and cannot be read as article text.";
        return res.json({
          url: targetUrl,
          text: fileMsg,
          formattedText: `fetched url: ${targetUrl}\ntext: ${fileMsg}`,
        });
      }

      const cleanLength = Math.min(10000, Math.max(100, parseInt(length) || 1100));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

      let fetchResult: { ok: boolean; status: number; contentType: string; body: string };
      try {
        fetchResult = await fetchWithByteLimit(targetUrl, controller.signal, MAX_FETCH_BYTES);
      } finally {
        clearTimeout(timeoutId);
      }

      if (!fetchResult.ok) {
        return res.json({
          url: targetUrl,
          text: errorFallback,
          formattedText: errorFallback,
        });
      }

      if (fetchResult.contentType && !/text\/html|application\/xhtml/i.test(fetchResult.contentType)) {
        const nonHtmlMsg = `This URL returned non-HTML content (${fetchResult.contentType.split(";")[0]}) and cannot be read as article text.`;
        return res.json({
          url: targetUrl,
          text: nonHtmlMsg,
          formattedText: `fetched url: ${targetUrl}\ntext: ${nonHtmlMsg}`,
        });
      }

      const { title, text: extractedFull } = extractReadableContent(fetchResult.body, targetUrl);

      if (!extractedFull) {
        return res.json({
          url: targetUrl,
          text: errorFallback,
          formattedText: errorFallback,
        });
      }

      const extracted = extractedFull.slice(0, cleanLength);
      const titlePart = title ? `title: ${title}\n` : "";
      const formattedText = `fetched url: ${targetUrl}\n${titlePart}text: ${extracted}`;

      return res.json({
        url: targetUrl,
        title,
        text: extracted,
        formattedText,
      });
    } catch (error: any) {
      console.error("Fetch URL error:", error);
      return res.json({
        url: req.body?.url,
        text: errorFallback,
        formattedText: errorFallback,
      });
    }
  });

  // Read doc from /docs endpoint
  app.post("/api/read-doc", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "Missing name parameter" });
      }

      const cleanName = name.trim().toLowerCase().replace(/^['"`]|['"`]$/g, "");
      const docsDir = path.join(process.cwd(), "docs");

      try {
        const files = await fs.promises.readdir(docsDir);
        let targetFile = files.find(
          (f) => f.toLowerCase() === cleanName || f.toLowerCase() === `${cleanName}.md`
        );

        if (!targetFile) {
          if (cleanName.includes("fanluc")) targetFile = files.find((f) => f.includes("fanluc"));
          else if (cleanName.includes("guide")) targetFile = files.find((f) => f.includes("guide"));
          else if (cleanName.includes("mondk")) targetFile = files.find((f) => f.includes("mondk"));
          else if (cleanName.includes("msh")) targetFile = files.find((f) => f.includes("msh"));
          else targetFile = files.find((f) => f.toLowerCase().includes(cleanName));
        }

        if (targetFile) {
          const content = await fs.promises.readFile(path.join(docsDir, targetFile), "utf-8");
          return res.json({
            found: true,
            fileName: targetFile,
            content,
            formattedText: `doc: ${targetFile}\ncontent:\n${content}`,
          });
        }

        return res.json({
          found: false,
          fileName: name,
          content: `Doc '${name}' not found in /docs/`,
          formattedText: `Doc '${name}' not found in /docs/`,
        });
      } catch (err: any) {
        return res.json({
          found: false,
          fileName: name,
          content: `Error reading docs directory: ${err?.message}`,
          formattedText: `Error reading docs directory: ${err?.message}`,
        });
      }
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Failed to read doc" });
    }
  });

  // Translation endpoint using google-translate-api-x
  app.post("/api/translate", async (req, res) => {
    try {
      const { text, to = "en", from = "auto" } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Missing text parameter" });
      }

      const cleanText = text.trim();
      if (!cleanText) {
        return res.status(400).json({ error: "Empty text parameter" });
      }

      const result = await translate(cleanText, {
        to: to || "en",
        from: from || "auto",
      });

      const translatedText = typeof result?.text === "string" ? result.text : String(result?.text ?? "");
      const detectedFrom = result?.from?.language?.iso || from || "auto";

      return res.json({
        translatedText,
        detectedFrom,
        originalText: cleanText,
        targetLang: to,
        formattedText: `translated "${cleanText}" (${detectedFrom} -> ${to}): "${translatedText}"`,
      });
    } catch (error: any) {
      console.error("Translation API error:", error);
      return res.status(500).json({
        error: error?.message || "Translation failed",
        translatedText: "",
        detectedFrom: req.body?.from || "auto",
        formattedText: `translation failed: ${error?.message || "error"}`,
      });
    }
  });

  // Weather endpoint for show_weather
  app.get("/api/weather", async (req, res) => {
    try {
      const { lat, lon, city } = req.query;
      let finalLat = lat;
      let finalLon = lon;
      let locationName = "Unknown Location";

      if (city && city !== "auto") {
        // Geocode city using Open-Meteo
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(String(city))}&count=1&language=en&format=json`);
        const geoData = await geoRes.json();
        if (geoData.results && geoData.results.length > 0) {
          finalLat = geoData.results[0].latitude;
          finalLon = geoData.results[0].longitude;
          locationName = geoData.results[0].name + (geoData.results[0].country ? `, ${geoData.results[0].country}` : "");
        } else {
          return res.status(404).json({ error: "City not found" });
        }
      } else if (lat && lon) {
        // Reverse geocode for name using BigDataCloud free client API
        try {
          const revGeoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
          const revGeoData = await revGeoRes.json();
          locationName = revGeoData.city || revGeoData.locality || revGeoData.principalSubdivision || "Your Location";
        } catch (e) {
          locationName = "Your Location";
        }
      } else {
        return res.status(400).json({ error: "Provide lat/lon or city" });
      }

      // Fetch weather using Open-Meteo
      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${finalLat}&longitude=${finalLon}&current_weather=true`);
      const weatherData = await weatherRes.json();

      if (!weatherData.current_weather) {
         return res.status(500).json({ error: "Weather data not available" });
      }

      const current = weatherData.current_weather;
      // Map WMO weather code to condition
      const code = current.weathercode;
      let condition = "Clear";
      if (code === 0) condition = "Sunny"; // Clear sky
      else if (code === 1 || code === 2 || code === 3) condition = "Cloudy"; // Mainly clear, partly cloudy, and overcast
      else if (code === 45 || code === 48) condition = "Fog";
      else if (code >= 51 && code <= 67) condition = "Rainy"; // Drizzle and Rain
      else if (code >= 71 && code <= 77) condition = "Snow";
      else if (code >= 80 && code <= 82) condition = "Rainy"; // Rain showers
      else if (code >= 85 && code <= 86) condition = "Snow"; // Snow showers
      else if (code >= 95 && code <= 99) condition = "Stormy"; // Thunderstorm

      // Determine if Windy based on windspeed (rough estimation)
      if (current.windspeed > 20 && (condition === "Sunny" || condition === "Cloudy" || condition === "Clear")) {
        condition = "Windy";
      }

      res.json({
        location: locationName,
        temperature: current.temperature,
        condition,
        isDay: current.is_day === 1,
        time: current.time,
      });
    } catch (error: any) {
      console.error("Weather API error:", error);
      res.status(500).json({ error: "Failed to fetch weather" });
    }
  });

  // run_cmd / background jobs / workspace picker / workspace files: see localExec.ts
  registerLocalRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const HOST = process.env.HOST || "127.0.0.1"; // loopback only by default (there is no sandbox!)
  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://localhost:${PORT}  (bound to ${HOST})`);
    console.log(`Workspace: ${getWorkspace()}  |  shell: ${SHELL.label}`);
    if (!["127.0.0.1", "localhost", "::1"].includes(HOST)) {
      console.warn("[security] HOST is not loopback. Commands run WITHOUT a sandbox: anyone who can reach this port can run commands on this PC.");
    }
  });
}

// Close MCP child processes on exit so servers like colab-mcp don't linger as orphans.
let shuttingDown = false;
function closeAllMcp() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const entry of mcp.values()) {
    try {
      entry.client?.close();
    } catch {}
  }
}
process.on("SIGINT", () => { closeAllMcp(); setTimeout(() => process.exit(0), 300); });
process.on("SIGTERM", () => { closeAllMcp(); setTimeout(() => process.exit(0), 300); });
process.on("exit", closeAllMcp);

startServer();
