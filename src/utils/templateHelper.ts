// Template & Special Tokens Cleaning Helper

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseTagList(input?: string): string[] {
  if (!input || typeof input !== "string") return [];
  return input
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Strips custom opening and closing tags/tokens specified by the user
 * (e.g. <|channel>, <channel|>, <|tool_call>, <tool_call|>, <|im_start|>, <|im_end|>)
 */
export function stripCustomTemplateTags(
  content: string,
  openTagsStr?: string,
  closeTagsStr?: string
): string {
  if (!content || typeof content !== "string") return "";

  let cleaned = content;

  const openTags = parseTagList(openTagsStr);
  for (const tag of openTags) {
    if (!tag) continue;
    try {
      const re = new RegExp(escapeRegex(tag), "gi");
      cleaned = cleaned.replace(re, "");
    } catch {
      // fallback
    }
  }

  const closeTags = parseTagList(closeTagsStr);
  for (const tag of closeTags) {
    if (!tag) continue;
    try {
      const re = new RegExp(escapeRegex(tag), "gi");
      cleaned = cleaned.replace(re, "");
    } catch {
      // fallback
    }
  }

  return cleaned;
}
