import { getEffortPrompt, ROLE_USER_PROMPT } from "../../prompts/index.js";
import type { EffortLevel } from "../../types.js";

export interface ApiConfigLike {
  systemPrompt?: string;
  effort?: string;
  thinkStartTag?: string;
  thinkEndTag?: string;
  [key: string]: unknown;
}

export interface SystemPromptOpts {
  config: ApiConfigLike;
  fanlucMd?: { path: string; content: string } | null;
  mcpToolsPrompt?: string;
  isAiRoleSimEnabled?: boolean;
}

export function buildSystemPrompt(opts: SystemPromptOpts): string {
  const { config, fanlucMd, mcpToolsPrompt, isAiRoleSimEnabled } = opts;
  let base: string;
  if (isAiRoleSimEnabled) {
    base =
      config.systemPrompt && config.systemPrompt.trim()
        ? `${config.systemPrompt.trim()}\n\n${ROLE_USER_PROMPT}`.trim()
        : ROLE_USER_PROMPT;
  } else {
    const effort = (["fast", "cautious", "thorough", "meticulous", "omni"] as string[]).includes(config.effort as string)
      ? (config.effort as EffortLevel)
      : "fast";
    const effortInstruction = getEffortPrompt(effort);
    if (config.systemPrompt && config.systemPrompt.trim()) {
      base = effortInstruction.trim()
        ? `${config.systemPrompt.trim()}\n\n${effortInstruction.trim()}`.trim()
        : config.systemPrompt.trim();
    } else {
      base = effortInstruction.trim();
    }
  }
  if (mcpToolsPrompt) {
    base += mcpToolsPrompt;
  }
  if (fanlucMd?.content) {
    base = `${base}\n\n[Workspace Context: ${fanlucMd.path}]\n${fanlucMd.content}`.trim();
  }
  return base;
}
