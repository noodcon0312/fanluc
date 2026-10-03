import { MemEntry } from "../types";
import { parseBracedCommands } from "./codeRunner";
import { kv } from "./kv";

// ============================================================================
// mem: two separate namespaces so the AI's own memories and the user's
// hand-authored ones can never overwrite each other --
//   - userMemEntries: created/edited only through the MEM settings tab.
//   - aiMemEntries: created/updated only by the AI's own write_mem{...} calls.
// read_mem(name) searches both; write_mem{...} only ever touches aiMemEntries.
// ============================================================================

export function newMemEntry(name: string, keywords: string[], content: string): MemEntry {
  const now = Date.now();
  return { id: `mem_${now}_${Math.random().toString(36).slice(2, 8)}`, name: name.trim(), keywords, content: content.trim(), createdAt: now, updatedAt: now };
}

function normalizeKeywordList(raw: string): string[] {
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

// ------------------------------------------------------- write_mem{...} -----
// write_mem{
// name: <short id-like name>
// keywords: <comma, separated, list>
// content: <everything from here to the end of the block, can be multi-line>
// }
export interface ParsedWriteMem {
  fullMatch: string;
  name: string;
  keywords: string[];
  content: string;
}

export function parseWriteMemCommands(text: string): ParsedWriteMem[] {
  const blocks = parseBracedCommands(text, /\bwrite_mem\s*\{/gi);
  const results: ParsedWriteMem[] = [];
  for (const block of blocks) {
    const body = block.code;
    const nameMatch = body.match(/^[ \t]*name\s*:\s*(.+)$/im);
    const keywordsMatch = body.match(/^[ \t]*keywords\s*:\s*(.+)$/im);
    const contentIdx = body.search(/^[ \t]*content\s*:/im);
    if (!nameMatch || contentIdx === -1) continue; // malformed, skip rather than crash
    const contentLineMatch = body.slice(contentIdx).match(/^[ \t]*content\s*:\s*/i);
    const content = body.slice(contentIdx + (contentLineMatch ? contentLineMatch[0].length : 0)).trim();
    if (!content) continue;
    results.push({
      fullMatch: block.fullMatch,
      name: nameMatch[1].trim(),
      keywords: keywordsMatch ? normalizeKeywordList(keywordsMatch[1]) : [],
      content,
    });
  }
  return results;
}

export function stripWriteMemCommands(text: string): string {
  if (!text || typeof text !== "string") return "";
  let cleaned = text;
  for (const cmd of parseBracedCommands(cleaned, /\bwrite_mem\s*\{/gi)) cleaned = cleaned.replace(cmd.fullMatch, "");
  cleaned = cleaned.replace(/\bwrite_mem\s*\{[\s\S]*?(?:\}|$)/gi, "");
  return cleaned.trim();
}

/** Applies a write_mem{...} call to the AI's own memory list (never touches userMemEntries). */
export function applyWriteMem(aiMemEntries: MemEntry[], parsed: ParsedWriteMem): { updated: MemEntry[]; resultText: string } {
  const existingIdx = aiMemEntries.findIndex((e) => e.name.toLowerCase() === parsed.name.toLowerCase());
  const now = Date.now();
  let updated: MemEntry[];
  let resultText: string;
  if (existingIdx !== -1) {
    updated = aiMemEntries.slice();
    updated[existingIdx] = { ...updated[existingIdx], keywords: parsed.keywords, content: parsed.content, updatedAt: now };
    resultText = `Updated memory "${parsed.name}".`;
  } else {
    updated = [...aiMemEntries, newMemEntry(parsed.name, parsed.keywords, parsed.content)];
    resultText = `Saved memory "${parsed.name}".`;
  }
  return { updated, resultText };
}

// ---------------------------------------------------------- read_mem(...) ---
export interface ParsedReadMem {
  fullMatch: string;
  name: string;
}

export function parseReadMemCommands(text: string): ParsedReadMem[] {
  if (!text || typeof text !== "string") return [];
  const re = /\bread_mem\s*\(\s*["'`]?([^)"'`]+?)["'`]?\s*\)/gi;
  const results: ParsedReadMem[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push({ fullMatch: m[0], name: m[1].trim() });
  }
  return results;
}

export function stripReadMemCommands(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text.replace(/\bread_mem\s*\(\s*["'`]?[^)"'`]+?["'`]?\s*\)/gi, "").trim();
}

export function executeReadMem(name: string, userMemEntries: MemEntry[], aiMemEntries: MemEntry[]): string {
  const lower = name.trim().toLowerCase();
  const fromUser = userMemEntries.find((e) => e.name.toLowerCase() === lower);
  const fromAi = aiMemEntries.find((e) => e.name.toLowerCase() === lower);
  if (!fromUser && !fromAi) {
    return `No memory named "${name}" found (checked both user and AI memory).`;
  }
  const parts: string[] = [];
  if (fromUser) parts.push(`[user memory "${fromUser.name}"]\n${fromUser.content}`);
  if (fromAi) parts.push(`[AI memory "${fromAi.name}"]\n${fromAi.content}`);
  return parts.join("\n\n");
}

// --------------------------------------------------- keyword auto-detect ---

/** Every entry (user + AI) whose keywords appear in the given text (case-insensitive, word-ish match). */
export function findMatchingMemEntries(text: string, userMemEntries: MemEntry[], aiMemEntries: MemEntry[]): { entry: MemEntry; matchedKeyword: string; origin: "user" | "ai" }[] {
  if (!text) return [];
  const lowerText = text.toLowerCase();
  const results: { entry: MemEntry; matchedKeyword: string; origin: "user" | "ai" }[] = [];
  const scan = (entries: MemEntry[], origin: "user" | "ai") => {
    for (const entry of entries) {
      for (const kw of entry.keywords) {
        const kwLower = kw.toLowerCase().trim();
        if (kwLower && lowerText.includes(kwLower)) {
          results.push({ entry, matchedKeyword: kw, origin });
          break; // one hit per entry is enough
        }
      }
    }
  };
  scan(userMemEntries, "user");
  scan(aiMemEntries, "ai");
  return results;
}

/**
 * Builds the short hint prepended (for the API call only, never shown in the
 * chat UI) to the user's message when its text matches saved keywords:
 * "if you don't know anything about {keyword}, use read_mem(name) to read it."
 */
export function buildMemHint(matches: { entry: MemEntry; matchedKeyword: string }[]): string {
  if (matches.length === 0) return "";
  const lines = matches.map((m) => `If you don't know anything about "${m.matchedKeyword}", use read_mem("${m.entry.name}") to read it.`);
  return `[Memory hint -- internal, do not mention this note itself to the user]\n${lines.join("\n")}`;
}

// --------------------------------------------------- persistent storage ---
const K_USER_MEMS = "fanluc_user_mems";
const K_AI_MEMS = "fanluc_ai_mems";

export function getStoredUserMems(): MemEntry[] {
  try {
    const raw = kv.getItem(K_USER_MEMS);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveStoredUserMems(list: MemEntry[]) {
  try {
    kv.setItem(K_USER_MEMS, JSON.stringify(list));
  } catch {}
}

export function getStoredAiMems(): MemEntry[] {
  try {
    const raw = kv.getItem(K_AI_MEMS);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveStoredAiMems(list: MemEntry[]) {
  try {
    kv.setItem(K_AI_MEMS, JSON.stringify(list));
  } catch {}
}

// -------------------------------------------- system-prompt tool teaching ---

/** Appended to the system prompt only while the mem toggle is on (independent of whether the write_mem skill was loaded, so read_mem always works from the keyword hint above). */
export function getMemToolsPrompt(): string {
  return `

---

MEMORY (read_mem / write_mem)

read_mem("name") reads a saved memory by name (checks both the user's own saved memories and your
own past ones) and returns its content, or says it wasn't found.

write_mem{
name: short_name_for_this_memory
keywords: comma, separated, keywords, that, should, trigger, recalling, this
content: the actual fact/preference/context to remember, in your own words.
}
Saves or updates ONE of your own memories (never touches memories the user created themselves --
those are a separate, protected list). Use this the same way you would use your own memory
feature: save durable, cross-conversation facts (the user's stated preferences, ongoing project
details, how they like things done) that would genuinely help a future conversation, not
one-off or trivial details from this single exchange. When you do save something, say so briefly
in one short sentence so the user knows and can correct it if it's wrong -- never save silently
and never save anything sensitive the user hasn't clearly volunteered for this purpose.`;
}
