import { getSearxngUrl } from "./userConfig";
// Yahoo Search & URL Fetch Helper Functions — now with SearXNG primary + image_search & mcp strip

export const SEARCH_REGEX = /(?:```[a-z]*\s*)?(?:call:)?search\s*\(\s*(?:query\s*=\s*)?(?:"([^"\r\n]+)"|'([^'\r\n]+)'|`([^`\r\n]+)`|([^\r\n,\)]+))\s*(?:,\s*(?:count\s*=\s*)?["'“”‘’]?(\d+)["'“”‘’]?)?\s*\)(?:\s*(?:\(|\,)\s*["'“”‘’]?(\d+)["'“”‘’]?\s*\)?)?(?:\s*```)?/gi;
export const FETCH_REGEX = /(?:```[a-z]*\s*)?(?:call:)?fetch\s*\(\s*(?:url\s*=\s*)?(?:"([^"\r\n]+)"|'([^'\r\n]+)'|`([^`\r\n]+)`|([^\r\n,\)\s]+))\s*(?:,\s*(?:length\s*=\s*|limit\s*=\s*)?["'“”‘’]?(\d+)["'“”‘’]?)?\s*\)(?:\s*(?:\(|\,)\s*["'“”‘’]?(\d+)["'“”‘’]?\s*\)?)?(?:\s*```)?/gi;

export interface SearchCommand {
  query: string;
  count: number;
}

export interface FetchCommand {
  url: string;
  length: number;
}

export function extractSearchCommand(text: string): SearchCommand | null {
  const all = extractAllSearchCommands(text);
  return all.length > 0 ? all[0] : null;
}

export function extractAllSearchCommands(text: string): SearchCommand[] {
  if (!text || typeof text !== "string") return [];
  const results: SearchCommand[] = [];
  const regex = new RegExp(SEARCH_REGEX.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const rawQuery = (match[1] || match[2] || match[3] || match[4] || "").trim();
    if (!rawQuery) continue;
    const query = rawQuery.replace(/^["'`]|["'`]$/g, "").trim();
    if (!query) continue;
    const rawCount = match[5] || match[6] || "";
    const count = rawCount ? (parseInt(rawCount, 10) || 7) : 7;
    results.push({ query, count });
  }
  return results;
}

export function extractFetchCommand(text: string): FetchCommand | null {
  const all = extractAllFetchCommands(text);
  return all.length > 0 ? all[0] : null;
}

export function extractAllFetchCommands(text: string): FetchCommand[] {
  if (!text || typeof text !== "string") return [];
  const results: FetchCommand[] = [];
  const regex = new RegExp(FETCH_REGEX.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const rawUrl = (match[1] || match[2] || match[3] || match[4] || "").trim();
    if (!rawUrl) continue;
    const url = rawUrl.replace(/^["'`]|["'`]$/g, "").trim();
    if (!url) continue;
    const rawLength = match[5] || match[6] || "";
    const length = rawLength ? (parseInt(rawLength, 10) || 1100) : 1100;
    results.push({ url, length });
  }
  return results;
}

export function hasUnexecutedFetch(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return /fetch\s*\(\s*["']/i.test(text) || /fetch\s*\(\s*https?:\/\//i.test(text) || /fetch\s*\(/i.test(text);
}

export function detectUnrecognizedOrMalformedCommands(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const potentialToolPatterns = [
    /\b(?:search|fetch|image_search|mcp_call|call_mcp|translate|show_weather|read_docs|load_skills|list_skills|install_pack_v1|see_history|list_history|list_chat_keywords|run_cmd|write_file|edit_file|delete_file|move_file|read_file|glob_files|grep_files|git_diff|git_checkout|show_map|list_cmd_bg|kill_cmd_bg|read_cmd_bg_log|read_mem|list_agent|view_image_agent|prompt_agent)\s*\(/i,
    /\binstall_pack_v1\b/i,
    /\b(?:write|edit|delete|move|read|glob|grep)\s*\(\s*["'{]/i,
    /\bcall:\s*[a-zA-Z0-9_-]+/i,
    /\btool_call\s*\(/i,
    /\[PYTHON\]\[COPY\]/i,
    /\[JS\]\[COPY\]/i,
    /\b(?:search|fetch|image_search|mcp_call|translate|show_weather|read_docs|load_skills|see_history|run_cmd|write|edit|read)\s*\([^)]*$/i,
  ];
  return potentialToolPatterns.some((pattern) => pattern.test(text));
}

import { stripAllFileCommands } from "./fileCommands";
import { stripRunCodeCommands as stripRunCmdCommands } from "./codeRunner";
import { stripReadDocsCommands } from "./docsHelper";
import { stripTranslateCommands } from "./translateHelper";
import { stripWeatherCommands } from "./weatherHelper";

export function cleanAiCommands(content: string): string {
  if (!content || typeof content !== "string") return "";
  let cleaned = content
    .replace(/\b(?:call:)?search\s*\(\s*(?:query\s*=\s*)?(?:"[^"\r\n]*"|'[^'\r\n]*'|`[^`\r\n]*`|[^\r\n,\)]*)\s*(?:,\s*(?:count\s*=\s*)?["'“”‘’]?\d+["'“”‘’]?)?\s*\)(?:\s*(?:\(|\,)\s*["'“”‘’]?\d+["'“”‘’]?\s*\)?)*(?:;)?/gi, "")
    .replace(/\b(?:call:)?fetch\s*\(\s*(?:url\s*=\s*)?(?:"[^"\r\n]*"|'[^'\r\n]*'|`[^`\r\n]*`|[^\r\n,\)\s]*)\s*(?:,\s*(?:length\s*=\s*|limit\s*=\s*)?["'“”‘’]?\d+["'“”‘’]?)?\s*\)(?:\s*(?:\(|\,)\s*["'“”‘’]?\d+["'“”‘’]?\s*\)?)*(?:;)?/gi, "")
    .replace(/\b(?:call:)?image_search\s*\(\s*(?:query\s*=\s*)?(?:"[^"\r\n]*"|'[^'\r\n]*'|`[^`\r\n]*`|[^\r\n,\)]*)\s*(?:,\s*(?:count\s*=\s*)?["'“”‘’]?\d+["'“”‘’]?)?\s*\)(?:\s*(?:\(|\,)\s*["'“”‘’]?\d+["'“”‘’]?\s*\)?)*(?:;)?/gi, "")
    .replace(/\b(?:call:)?(?:mcp_call|call_mcp)\s*\([^)]*\)(?:;)?/gi, "")
    .replace(/\blist_history\s*\(\s*\d+\s*\)(?:\s*\(\s*\d*\s*\))?(?:;)?/gi, "")
    .replace(/\bsee_history\s*\(\s*[0-9,\s]+\s*\)(?:\s*\(\s*\d*\s*\))?(?:;)?/gi, "")
    .replace(/\blist_chat_keywords\s*\(\s*[^)]+\s*\)(?:;)?/gi, "")
    .replace(/\blist_skills\b(?:\s*\(\s*\))?(?:;)?/gi, "")
    .replace(/\bload_skills\b\s*\(\s*[^)]+\s*\)(?:;)?/gi, "")
    .replace(/\binstall_pack_v1\b(?:\s*\(\s*\))?(?:;)?/gi, "")
    .replace(/\bread_docs\b\s*\(\s*[^)]+\s*\)(?:;)?/gi, "")
    .replace(/\blist_cmd_bg\b\s*\(\s*\)(?:;)?/gi, "")
    .replace(/\bkill_cmd_bg\b\s*\([^)]*\)(?:;)?/gi, "")
    .replace(/\bread_cmd_bg_log\b\s*\([^)]*\)(?:;)?/gi, "")
    .replace(/\[SEARCHING_YAHOO:[^\]]*\]/gi, "")
    .replace(/\[FETCHING_URL:[^\]]*\]/gi, "")
    .replace(/\[TRANSLATING_TEXT:[^\]]*\]/gi, "")
    .replace(/\[FETCHING_WEATHER:[^\]]*\]/gi, "")
    .replace(/\[RUNNING_JS_CMD:[^\]]*\]/gi, "")
    .replace(/\[(SEARCHING_YAHOO|FETCHING_URL|TRANSLATING_TEXT|FETCHING_WEATHER|RUNNING_CMD|RUNNING_JS_CMD|RUNNING_PY_CMD|WRITING_FILE|EDITING_FILE|DELETING_FILE|MOVING_FILE|READING_FILE|GLOB_FILES|GREP_FILES|GIT_DIFF|GIT_CHECKOUT|READING_HISTORY_PART|VIEWING_HISTORY_TURNS|SEARCHING_HISTORY_KEYWORDS|FETCH_URL_FAILED|LISTING_SKILLS|LOADING_SKILLS|READING_DOC|READING_DOCS):[^\]]*\]/gi, "")
    .replace(/\[[A-Z_]+_ING:[^\]]*\]/gi, "")
    .replace(/\[[A-Z_]+_ING\]/gi, "")
    .replace(/(?:^|\n)?\s*\[\/?INTERMED(?:IATE|IUM|IAT|IA|I|U)?\]?\s*(?:\n|$)?/gi, "\n")
    .replace(/(?:^|\n)\s*\[\s*\d+\s*\]\s*(?=\n|$)/gi, "\n")
    .replace(/\[\s*\d+\s*\]/g, "");

  cleaned = stripAllFileCommands(cleaned);
  cleaned = stripRunCmdCommands(cleaned);
  cleaned = stripReadDocsCommands(cleaned);
  cleaned = stripTranslateCommands(cleaned);
  cleaned = stripWeatherCommands(cleaned);

  // Strip any partial / in-progress search, fetch, image_search, mcp_call, translate, weather, or history calls at end of string
  cleaned = cleaned.replace(/\b(?:call:)?(?:search|fetch|image_search|mcp_call|call_mcp|translate|show_weather|list_history|see_history|list_chat_keywords|load_skills|read_docs)\s*\([^)]*$/gi, "");

  // Clean dangling intermediate tags and empty code blocks
  cleaned = cleaned
    .replace(/```[a-zA-Z0-9_\-]*\s*```/g, "")
    .replace(/(?:^|\n)?\s*\[\/?INTERMED(?:IATE|IUM|IAT|IA|I|U)?\]?\s*(?:\n|$)?/gi, "\n")
    .replace(/^[ \t]*`{1,6}[ \t]*$/gm, "");

  return cleaned
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function performYahooSearch(query: string, count = 7): Promise<string> {
  try {
    const response = await fetch("/api/yahoo-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, count, searxngUrl: getSearxngUrl() }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return `${count} results:\n[Yahoo search error: ${errText}]`;
    }

    const data = await response.json();
    return data.formattedText || `${count} results:\n(No results found for "${query}")`;
  } catch (err: any) {
    return `${count} results:\n[Network error while querying Yahoo search: ${err?.message || "Error"}]`;
  }
}

export async function performFetchUrl(url: string, length = 1100): Promise<string> {
  const errorFallback = "you entered an incorrect URL, are missing characters, or the website no longer exists";
  try {
    const response = await fetch("/api/fetch-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, length }),
    });

    if (!response.ok) {
      return errorFallback;
    }

    const data = await response.json();
    return data.formattedText || errorFallback;
  } catch (err: any) {
    return errorFallback;
  }
}
