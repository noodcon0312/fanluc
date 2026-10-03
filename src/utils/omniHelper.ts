import { ApiConfig, MemEntry } from "../types";
import { FALLBACK_DOCS } from "./docsHelper";
import { CARD_DELIVERY_NOTE, isCardSkill } from "./skillHelper";

function formatMemEntries(label: string, entries: MemEntry[] = []): string {
  if (!entries || entries.length === 0) return "";
  const lines = entries.map((m: any) => {
    const kw = Array.isArray(m.keywords) ? m.keywords.join(", ") : "";
    return `<mem name="${m.name}" keywords="${kw}">\n${m.content || ""}\n</mem>`;
  });
  return `<${label}>\n${lines.join("\n")}\n</${label}>`;
}

/**
 * Omni context: appended to the END of the system prompt when the effort is
 * "omni". It inlines everything the model could otherwise fetch on demand:
 * every enabled skill (full content), the built-in docs, and saved memory.
 * Tool syntax (search, run_cmd, MCP, agents, mem commands) is already in the
 * system prompt, so it is not repeated here.
 */
export function buildOmniContext(config: ApiConfig): string {
  const parts: string[] = [];

  const skills = (Array.isArray(config.skills) ? config.skills : []).filter((s) => s && s.enabled !== false);
  if (skills.length > 0) {
    const blocks = skills.map((s) => {
      const note = isCardSkill(s) ? `${CARD_DELIVERY_NOTE}\n\n` : "";
      return `<skill id="${s.id}" title="${s.title || "Untitled"}">\n${note}${s.content || ""}\n</skill>`;
    });
    parts.push(`<all_skills>\nEvery enabled skill is already loaded. Use the matching one directly.\n\n${blocks.join("\n\n")}\n</all_skills>`);
  }

  const docs = Object.entries(FALLBACK_DOCS).map(
    ([name, d]) => `<doc name="${name}" file="${d.fileName}">\n${d.content}\n</doc>`
  );
  if (docs.length > 0) {
    parts.push(`<all_docs>\nThe built-in documents are already loaded; read_docs is not needed to read them.\n\n${docs.join("\n\n")}\n</all_docs>`);
  }

  if (config.memEnabled) {
    const userMem = formatMemEntries("user_memory", config.userMemEntries);
    const aiMem = formatMemEntries("your_memory", config.aiMemEntries);
    const memBlock = [userMem, aiMem].filter(Boolean).join("\n");
    if (memBlock) {
      parts.push(`<all_memory>\nSaved memories, already loaded; read_mem is not needed to read them.\n${memBlock}\n</all_memory>`);
    }
  }

  if (parts.length === 0) return "";
  return `\n\n<omni_context>\n${parts.join("\n\n")}\n</omni_context>`;
}
