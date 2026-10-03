import { getSearxngUrl } from "./userConfig";
// Image Search helper — SearXNG categories=images
// UI renders grid (like MapEmbedCard), model only gets one-line summary to save context

export const IMAGE_SEARCH_REGEX = /(?:```[a-z]*\s*)?(?:call:)?image_search\s*\(\s*(?:query\s*=\s*)?(?:"([^"\r\n]+)"|'([^'\r\n]+)'|`([^`\r\n]+)`|([^\r\n,\)]+))\s*(?:,\s*(?:count\s*=\s*)?["'“”‘’]?(\d+)["'“”‘’]?)?\s*\)(?:\s*(?:\(|\,)\s*["'“”‘’]?(\d+)["'“”‘’]?\s*\)?)?(?:\s*```)?/gi;

export interface ImageSearchCommand {
  query: string;
  count: number;
}

export interface ImageResult {
  title: string;
  src: string;
  thumb: string;
  page: string;
}

export function extractAllImageSearchCommands(text: string): ImageSearchCommand[] {
  if (!text || typeof text !== "string") return [];
  const results: ImageSearchCommand[] = [];
  const regex = new RegExp(IMAGE_SEARCH_REGEX.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const rawQuery = (m[1] || m[2] || m[3] || m[4] || "").trim();
    if (!rawQuery) continue;
    const query = rawQuery.replace(/^["'`]|["'`]$/g, "").trim();
    if (!query) continue;
    const rawCount = m[5] || m[6] || "";
    const count = rawCount ? (parseInt(rawCount, 10) || 6) : 6;
    results.push({ query, count: Math.min(12, Math.max(1, count)) });
  }
  return results;
}

export function extractImageSearchCommands(text: string): ImageSearchCommand | null {
  const all = extractAllImageSearchCommands(text);
  return all.length ? all[0] : null;
}

export function stripImageSearchCommands(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text.replace(new RegExp(IMAGE_SEARCH_REGEX.source, "gi"), "").trim();
}

export async function performImageSearch(query: string, count = 6): Promise<{ images: ImageResult[]; formattedText: string }> {
  try {
    const resp = await fetch("/api/image-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, count, searxngUrl: getSearxngUrl() }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { images: [], formattedText: `Image search error: ${t}` };
    }
    const data = await resp.json();
    // data: { count, images: [{title,src,thumb,page}], formattedText }
    return { images: data.images || [], formattedText: data.formattedText || `Displayed ${data.count || 0} images for "${query}"` };
  } catch (e: any) {
    return { images: [], formattedText: `Image search failed: ${e?.message || e}` };
  }
}

// For App.tsx: we return images for UI card, and a short line for model context
export async function executeImageSearchForChat(cmd: ImageSearchCommand): Promise<{ images: ImageResult[]; modelLine: string }> {
  const { images, formattedText } = await performImageSearch(cmd.query, cmd.count);
  // Model should only see one-line summary, not URLs (saves context per prompt note)
  const modelLine = formattedText; // e.g. "Displayed 4 images for X"
  return { images, modelLine };
}
