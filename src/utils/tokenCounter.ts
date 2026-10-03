import { ChatMessage, ChatSession } from "../types";

/**
 * Standard GPT/Claude/Gemini token estimator:
 * ~4 characters per token for English/Code, ~1.5 - 2 characters per token for CJK/Vietnamese.
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  // Non-ASCII characters (e.g. Vietnamese accents, CJK) consume ~1 token per 2 chars
  const nonAscii = (text.match(/[^\x00-\x7F]/g) || []).length;
  const ascii = text.length - nonAscii;
  return Math.ceil(ascii / 4 + nonAscii / 2);
}

export interface ConversationMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  characterCount: number;
  avgTokensPerSec: number;
  totalToolCalls: number;
  systemInstructionTokens: number;
  toolCallsBreakdown: Record<string, number>;
}

export function computeSessionMetrics(
  session: ChatSession | undefined,
  activeSystemPrompt: string
): ConversationMetrics {
  if (!session || !session.messages) {
    const sysTokens = estimateTokens(activeSystemPrompt);
    return {
      totalTokens: sysTokens,
      promptTokens: sysTokens,
      completionTokens: 0,
      characterCount: activeSystemPrompt.length,
      avgTokensPerSec: 0,
      totalToolCalls: 0,
      systemInstructionTokens: sysTokens,
      toolCallsBreakdown: {},
    };
  }

  let promptTokens = estimateTokens(activeSystemPrompt);
  let completionTokens = 0;
  let totalChars = activeSystemPrompt.length;
  let totalAssistantDuration = 0;
  let totalAssistantTokensTimed = 0;

  const toolCallsBreakdown: Record<string, number> = {
    search: 0,
    fetch: 0,
    weather: 0,
    map: 0,
    translate: 0,
    files: 0,
    code_exec: 0,
    other: 0,
  };

  session.messages.forEach((msg) => {
    const msgTokens = estimateTokens(msg.content);
    totalChars += (msg.content || "").length;

    if (msg.role === "assistant") {
      completionTokens += msgTokens;
      if (msg.durationSeconds && msg.durationSeconds > 0) {
        totalAssistantDuration += msg.durationSeconds;
        totalAssistantTokensTimed += msgTokens;
      }
    } else {
      promptTokens += msgTokens;
    }

    // Count tool calls in content
    const text = msg.content || "";
    
    // Search calls
    const searchMatches = text.match(/\b(?:call:)?search\s*\(/gi);
    if (searchMatches) toolCallsBreakdown.search += searchMatches.length;

    // Fetch calls
    const fetchMatches = text.match(/\b(?:call:)?fetch\s*\(/gi);
    if (fetchMatches) toolCallsBreakdown.fetch += fetchMatches.length;

    // Weather calls
    const weatherMatches = text.match(/\b(?:call:)?show_weather\s*\(/gi);
    if (weatherMatches) toolCallsBreakdown.weather += weatherMatches.length;

    // Map calls
    const mapMatches = text.match(/\b(?:call:)?show_map\s*\(/gi);
    if (mapMatches) toolCallsBreakdown.map += mapMatches.length;

    // Translate calls
    const translateMatches = text.match(/\b(?:call:)?translate\s*\(/gi);
    if (translateMatches) toolCallsBreakdown.translate += translateMatches.length;

    // File operations
    const fileMatches = text.match(/\b(?:call:)?(?:write_file|edit_file|delete_file|move_file|read_file|glob_files|grep_files)\s*\(/gi);
    if (fileMatches) toolCallsBreakdown.files += fileMatches.length;

    // Code execution
    const codeMatches = text.match(/\b(?:call:)?run_cmd\s*\{/gi);
    if (codeMatches) toolCallsBreakdown.code_exec += codeMatches.length;
  });

  const totalToolCalls = Object.values(toolCallsBreakdown).reduce((a, b) => a + b, 0);

  const avgTokensPerSec =
    totalAssistantDuration > 0
      ? Math.round((totalAssistantTokensTimed / totalAssistantDuration) * 10) / 10
      : 0;

  const systemInstructionTokens = estimateTokens(activeSystemPrompt);
  const totalTokens = promptTokens + completionTokens;

  return {
    totalTokens,
    promptTokens,
    completionTokens,
    characterCount: totalChars,
    avgTokensPerSec,
    totalToolCalls,
    systemInstructionTokens,
    toolCallsBreakdown,
  };
}
