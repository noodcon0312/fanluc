import { Skill } from "../types";

export interface LoadSkillsCommand {
  skillIds: (number | string)[];
}

const LIST_SKILLS_REGEX = /\blist_skills\b(?:\s*\(\s*\))?(?:;)?/i;
const LOAD_SKILLS_REGEX = /\bload_skills\b\s*\(\s*([^)]+)\s*\)(?:;)?/i;
const INSTALL_PACK_REGEX = /\binstall_pack_v1\b(?:\s*\(\s*\))?(?:;)?/i;

export function hasInstallPackCommand(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return INSTALL_PACK_REGEX.test(text);
}

export function stripInstallPackCommands(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text.replace(new RegExp(INSTALL_PACK_REGEX.source, "gi"), "");
}

/**
 * install_pack_v1 — asks the SERVER to really verify (and repair where it is
 * allowed to) the essential toolchain. It never fabricates success: the report
 * lists every tool/library as OK or MISSING with real version strings.
 */
export async function executeInstallPack(): Promise<string> {
  // The server bounds each pip/apt step, but never let the chat hang forever on a stuck request.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15 * 60 * 1000);
  try {
    const res = await fetch("/api/install-pack", { method: "POST", signal: controller.signal });
    if (!res.ok) {
      return `[INSTALL_PACK_V1 STATUS: FAILED]\nServer returned HTTP ${res.status}. The environment was NOT verified.`;
    }
    const data = await res.json();
    return data.formattedText || "[INSTALL_PACK_V1 STATUS: FAILED]\nEmpty response from server.";
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return "[INSTALL_PACK_V1 STATUS: FAILED]\nThe install did not finish within 15 minutes. The environment was NOT verified; do not claim success.";
    }
    return `[INSTALL_PACK_V1 STATUS: FAILED]\nCould not reach the server: ${e?.message || e}. The environment was NOT verified.`;
  } finally {
    clearTimeout(timer);
  }
}

const COMMON_STOPWORDS = new Set([
  // English
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
  "can", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", "doing",
  "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't",
  "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself",
  "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is",
  "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my", "myself", "no",
  "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves",
  "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so",
  "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there",
  "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to",
  "too", "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were",
  "weren't", "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's",
  "whom", "why", "why's", "with", "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've",
  "your", "yours", "yourself", "yourselves", "the", "with", "this", "that", "will", "shall", "must"
]);

/**
 * Extract up to 10 most frequent meaningful keywords from skill title, describe and content
 */
export function extractTopTags(skill: Skill, maxTags: number = 10): string[] {
  if (skill.tags && skill.tags.length > 0) {
    return skill.tags.slice(0, maxTags);
  }

  const combinedText = `${skill.title || ""} ${skill.describe || ""} ${skill.content || ""}`.toLowerCase();
  const words = combinedText.match(/[a-z0-9_#-]{2,}/gi) || [];

  const freqMap = new Map<string, number>();
  for (const rawWord of words) {
    const word = rawWord.toLowerCase().trim();
    if (word.length < 2 || COMMON_STOPWORDS.has(word) || /^\d+$/.test(word)) {
      continue;
    }
    freqMap.set(word, (freqMap.get(word) || 0) + 1);
  }

  const sorted = Array.from(freqMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0]);

  return sorted.slice(0, maxTags);
}

/**
 * Checks if the model output contains list_skills command
 */
export function hasListSkillsCommand(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return LIST_SKILLS_REGEX.test(text);
}

/**
 * Parse all load_skills commands from text
 */
export function parseLoadSkillsCommands(text: string): LoadSkillsCommand[] {
  if (!text || typeof text !== "string") return [];
  const results: LoadSkillsCommand[] = [];
  const regex = new RegExp(LOAD_SKILLS_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const rawArgs = match[1];
    const ids: (number | string)[] = [];
    const parts = rawArgs.split(",");
    for (const part of parts) {
      const clean = part.trim().replace(/^['"`]|['"`]$/g, "").trim();
      if (!clean) continue;
      const numMatch = clean.match(/\b\d+\b/);
      if (numMatch) {
        const parsedNum = parseInt(numMatch[0], 10);
        if (!isNaN(parsedNum) && !ids.includes(parsedNum)) {
          ids.push(parsedNum);
          continue;
        }
      }
      if (!ids.includes(clean)) {
        ids.push(clean);
      }
    }
    if (ids.length > 0) {
      results.push({ skillIds: ids });
    }
  }

  return results;
}

/**
 * Gets accessible skills based on user prompt.
 * Locked skills (isLocked === true) are hidden and excluded from list_skills and load_skills
 * UNLESS the user prompt contains a keyword matching one of the skill's tags.
 */
export function getAccessibleSkills(skills: any = [], userPrompt?: string): Skill[] {
  const safeList: Skill[] = Array.isArray(skills) ? skills : [];
  const promptLower = (userPrompt || "").toLowerCase();

  return safeList.filter((s) => {
    if (!s || s.enabled === false) return false;

    // If the skill is locked, check if the user prompt has any matching tag
    if (s.isLocked) {
      if (!promptLower) return false;
      const tags: string[] = Array.isArray(s.tags) ? s.tags : [];
      const hasMatchingTag = tags.some((t) => {
        const cleanTag = String(t).trim().toLowerCase();
        if (!cleanTag) return false;
        // Check for whole word or substring match
        try {
          const regex = new RegExp(`\\b${cleanTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
          return regex.test(promptLower);
        } catch {
          return promptLower.includes(cleanTag);
        }
      });
      return hasMatchingTag;
    }

    return true;
  });
}

/**
 * Skills that render a visual card in chat. The model must write the command
 * as plain chat text; it must never route it through run_cmd or a file.
 */
const CARD_SKILL_IDS = new Set([
  "skill-map-card",
  "skill-step-guide",
  "skill-tab-card",
  "skill-chart-display-v0",
  "skill-pie-chart-display",
  "skill-translate",
  "skill-weather",
  "skill-image-search",
  "skill-turtle-card",
]);

export const CARD_DELIVERY_NOTE =
  "DELIVERY (overrides the file rule): this skill renders a card in chat. Write the command directly in your chat reply as plain text. Do NOT wrap it in run_cmd, do NOT save it to a file, do NOT write a script that generates it.";

export function isCardSkill(skill: Skill): boolean {
  return !!skill && CARD_SKILL_IDS.has(skill.id);
}

function normalizeForMatch(input: string): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Tags too common in normal conversation to trigger an auto-load on their own.
const GENERIC_TRIGGER_TAGS = new Set([
  "data", "tool", "tools", "server", "http", "stdio", "location", "places", "line", "bar",
  "compact", "instruction", "shape", "geometry", "graphics", "animation", "language", "tab", "tabs",
  "python", "pdf", "update", "setup", "packages", "dependencies", "share", "allocation", "general",
]);

/**
 * Skills whose tags appear in the user's latest message, best match first.
 * Locked skills are excluded (the docs skill has its own auto-load path).
 */
export function getAutoMatchedSkills(skills: any = [], userText: string = "", max: number = 3): Skill[] {
  const safeList: Skill[] = Array.isArray(skills) ? skills : [];
  const text = ` ${normalizeForMatch(userText)} `;
  if (!text.trim()) return [];

  const scored: { skill: Skill; score: number; order: number }[] = [];
  safeList.forEach((s, order) => {
    if (!s || s.enabled === false || s.isLocked) return;
    const tags: string[] = Array.isArray(s.tags) ? s.tags : [];
    let score = 0;
    for (const raw of tags) {
      const tag = normalizeForMatch(raw);
      if (!tag || tag.length < 3 || GENERIC_TRIGGER_TAGS.has(tag)) continue;
      if (text.includes(` ${tag} `) || text.includes(` ${tag}s `)) score += 1;
    }
    if (score > 0) scored.push({ skill: s, score, order });
  });

  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, max)
    .map((x) => x.skill);
}

/**
 * Block appended to the END of the system prompt so the model does not need
 * list_skills / load_skills for skills that clearly match the user's message.
 */
export function buildActiveSkillsPrompt(skills: any = [], userText: string = ""): string {
  const matched = getAutoMatchedSkills(skills, userText);
  if (matched.length === 0) return "";
  const blocks = matched.map((s) => {
    const note = isCardSkill(s) ? `${CARD_DELIVERY_NOTE}\n\n` : "";
    return `<skill id="${s.id}" title="${s.title || "Untitled"}">\n${note}${s.content || ""}\n</skill>`;
  });
  return (
    "\n\n<active_skills>\n" +
    "These skills matched the user's latest message and are ALREADY fully loaded. Follow them directly. Do not call list_skills or load_skills for them.\n\n" +
    blocks.join("\n\n") +
    "\n</active_skills>"
  );
}

/**
 * Executes list_skills and returns formatted summary
 */
export function executeListSkills(skills: any = [], userPrompt?: string): string {
  const accessible = getAccessibleSkills(skills, userPrompt);
  if (accessible.length === 0) {
    return "0 skills available. No active skills found.";
  }

  const lines: string[] = [];
  accessible.forEach((skill, index) => {
    const id = index + 1;
    const tags = extractTopTags(skill, 10);
    const tagStr = tags.length > 0 ? tags.join(", ") : "general";
    lines.push(`id ${id}) title: ${skill.title || "Untitled"}\ntag: ${tagStr}\ndescribe: ${skill.describe || ""}`);
  });

  return lines.join("\n");
}

/**
 * Executes load_skills for given skill IDs (1-based index or name)
 */
export function executeLoadSkills(skills: any = [], skillIds: (number | string)[], userPrompt?: string): string {
  const accessible = getAccessibleSkills(skills, userPrompt);
  if (accessible.length === 0) {
    return "No active skills available.";
  }

  const results: string[] = [];
  const seenIndices = new Set<number>();

  skillIds.forEach((idArg) => {
    let targetSkill: Skill | undefined;
    let targetIndex = -1;

    if (typeof idArg === "number") {
      const idx = idArg - 1;
      if (idx >= 0 && idx < accessible.length) {
        targetSkill = accessible[idx];
        targetIndex = idx + 1;
      }
    } else {
      const strKey = String(idArg).trim();
      const numMatch = strKey.match(/^\d+$/) || strKey.match(/\b\d+\b/);
      if (numMatch) {
        const idx = parseInt(numMatch[0], 10) - 1;
        if (idx >= 0 && idx < accessible.length) {
          targetSkill = accessible[idx];
          targetIndex = idx + 1;
        }
      }
      if (!targetSkill) {
        const cleanKey = strKey.toLowerCase().replace(/^['"`]|['"`]$/g, "").trim();
        const foundIdx = accessible.findIndex(
          (s) =>
            s.id.toLowerCase() === cleanKey ||
            (s.title && s.title.toLowerCase() === cleanKey)
        );
        if (foundIdx !== -1) {
          targetSkill = accessible[foundIdx];
          targetIndex = foundIdx + 1;
        }
      }
    }

    if (targetSkill && targetIndex > 0) {
      if (!seenIndices.has(targetIndex)) {
        seenIndices.add(targetIndex);
        results.push(`id ${targetIndex}) content: ${isCardSkill(targetSkill) ? CARD_DELIVERY_NOTE + "\n\n" : ""}${targetSkill.content || ""}`);
      }
    } else {
      results.push(`id ${idArg}) content: [Error: Skill with id ${idArg} not found. Available IDs: 1 to ${accessible.length}]`);
    }
  });

  if (results.length === 0) {
    return "No skills loaded.";
  }

  return results.join("\n");
}
