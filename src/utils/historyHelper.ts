import { ChatMessage } from "../types";
import { parseThinkContent } from "./parseThink";
import { stripRunCodeCommands, applyReplaceOutputOverride, stripFakeIntermediateTags, stripRunCmdBgCommands } from "./codeRunner";
import { stripWriteMemCommands, stripReadMemCommands } from "./memHelper";
import { stripPromptAgentCommands, stripListAgentCommands, stripViewImageAgentCommands } from "./agentHelper";
import { stripTurtleCardCommands } from "../components/TurtleCard";
import { stripAllFileCommands } from "./fileCommands";
import { cleanAiCommands } from "./yahooSearch";
import { stripMcpCalls } from "./mcpHelper";
import { stripImageSearchCommands } from "./imageSearch";
import { stripTranslateCommands } from "./translateHelper";
import { stripWeatherCommands } from "./weatherHelper";
import { stripReadDocsCommands } from "./docsHelper";
import { stripCustomTemplateTags } from "./templateHelper";
import { stripAskCommand } from "./askHelper";
import { stripShowMapCommands } from "../components/MapEmbedCard";
import { stripStepGuideCommands } from "../components/StepGuideCard";
import { stripTabCardCommands } from "../components/TabCard";
import { stripChartDisplayCommands } from "../components/ChartDisplayCard";
import { stripPieChartDisplayCommands } from "../components/PieChartDisplayCard";

/**
 * The raw text stored for an assistant turn (ChatMessage.content) keeps every
 * [INTERMEDIATE]/[/INTERMEDIATE] wrapper, <think>...</think> block, and raw
 * tool-call syntax (search(...), run_cmd{...}, etc.) exactly as the model
 * produced it — the chat UI only cleans it up for DISPLAY, at render time.
 * list_history / see_history / list_chat_keywords used to hand this SAME
 * raw text back to the model as a tool result, truncated to a character
 * limit that can land in the middle of a tag. That is a direct way for the
 * model to see (and then start echoing) its own literal "</think>" or
 * "[INTERMEDIATE]" markers — tokens it should never produce itself. This
 * sanitizes a stored turn's text down to the same thing a person actually
 * saw in the chat before it's ever reused as tool-result context.
 */
function sanitizeForHistory(raw: string, thinkStart?: string, thinkEnd?: string): string {
  if (!raw || typeof raw !== "string") return "";
  let text = applyReplaceOutputOverride(raw);
  text = parseThinkContent(text, thinkStart, thinkEnd).mainText;
  text = stripFakeIntermediateTags(text);
  text = cleanAiCommands(text);
  text = stripAllFileCommands(text);
  text = stripRunCodeCommands(text);
  text = stripRunCmdBgCommands(text);
  text = stripWriteMemCommands(text);
  text = stripReadMemCommands(text);
  text = stripPromptAgentCommands(text);
  text = stripListAgentCommands(text);
  text = stripViewImageAgentCommands(text);
  text = stripTurtleCardCommands(text);
  text = stripShowMapCommands(text);
  text = stripImageSearchCommands(text);
  text = stripMcpCalls(text);
  text = stripStepGuideCommands(text);
  text = stripTabCardCommands(text);
  text = stripChartDisplayCommands(text);
  text = stripPieChartDisplayCommands(text);
  text = stripReadDocsCommands(text);
  text = stripTranslateCommands(text);
  text = stripWeatherCommands(text);
  text = stripCustomTemplateTags(text);
  text = stripAskCommand(text);
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export interface HistoryTurn {
  turnNumber: number;
  userText: string;
  aiText: string;
}

export interface ListHistoryCommand {
  part: number;
  limit: number;
}

export interface SeeHistoryCommand {
  turnNumbers: number[];
  limit: number;
}

export interface ListKeywordsCommand {
  keywords: string[];
}

const LIST_HISTORY_REGEX = /\blist_history\s*\(\s*(\d+)\s*\)(?:\s*\(\s*(\d*)\s*\))?(?:;)?/gi;
const SEE_HISTORY_REGEX = /\bsee_history\s*\(\s*([0-9,\s]+)\s*\)(?:\s*\(\s*(\d*)\s*\))?(?:;)?/gi;
const LIST_KEYWORDS_REGEX = /\blist_chat_keywords\s*\(\s*([^)]+)\s*\)(?:;)?/gi;

export function extractListHistoryCommand(text: string): ListHistoryCommand | null {
  const all = extractAllListHistoryCommands(text);
  return all.length > 0 ? all[0] : null;
}

export function extractAllListHistoryCommands(text: string): ListHistoryCommand[] {
  if (!text || typeof text !== "string") return [];
  const results: ListHistoryCommand[] = [];
  const regex = new RegExp(LIST_HISTORY_REGEX.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const part = parseInt(match[1], 10) || 1;
    const rawLimit = match[2] ? match[2].trim() : "";
    const limit = rawLimit ? (parseInt(rawLimit, 10) || 500) : 500;
    results.push({ part, limit });
  }
  return results;
}

export function extractSeeHistoryCommand(text: string): SeeHistoryCommand | null {
  const all = extractAllSeeHistoryCommands(text);
  return all.length > 0 ? all[0] : null;
}

export function extractAllSeeHistoryCommands(text: string): SeeHistoryCommand[] {
  if (!text || typeof text !== "string") return [];
  const results: SeeHistoryCommand[] = [];
  const regex = new RegExp(SEE_HISTORY_REGEX.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const turnNumbers = match[1]
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
    if (turnNumbers.length === 0) continue;
    const rawLimit = match[2] ? match[2].trim() : "";
    const limit = rawLimit ? (parseInt(rawLimit, 10) || 1100) : 1100;
    results.push({ turnNumbers, limit });
  }
  return results;
}

export function extractListKeywordsCommand(text: string): ListKeywordsCommand | null {
  const all = extractAllListKeywordsCommands(text);
  return all.length > 0 ? all[0] : null;
}

export function extractAllListKeywordsCommands(text: string): ListKeywordsCommand[] {
  if (!text || typeof text !== "string") return [];
  const results: ListKeywordsCommand[] = [];
  const regex = new RegExp(LIST_KEYWORDS_REGEX.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const rawArgs = match[1];
    const wordRegex = /["']([^"']+)["']|([^,\s"']+)/g;
    const keywords: string[] = [];
    let m;
    while ((m = wordRegex.exec(rawArgs)) !== null) {
      const word = (m[1] || m[2] || "").trim();
      if (word && !keywords.includes(word)) {
        keywords.push(word);
      }
    }
    if (keywords.length > 0) {
      results.push({ keywords });
    }
  }
  return results;
}

export function extractHistoryTurns(
  messages: ChatMessage[],
  excludeCurrentPending = true,
  thinkStartTag?: string,
  thinkEndTag?: string
): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  let turnNumber = 1;
  let currentUserText = "";
  let currentAiText = "";
  let inTurn = false;

  const msgs = [...messages];
  if (excludeCurrentPending && msgs.length > 0 && msgs[msgs.length - 1].role === "user") {
    msgs.pop();
  }

  const cleanAi = (raw: string) => sanitizeForHistory(raw, thinkStartTag, thinkEndTag);

  for (const m of msgs) {
    if (m.status === "error") continue;
    if (m.role === "user") {
      if (inTurn && (currentUserText || currentAiText)) {
        turns.push({
          turnNumber: turnNumber++,
          userText: currentUserText.trim(),
          aiText: currentAiText.trim(),
        });
        currentUserText = "";
        currentAiText = "";
      }
      // Defensive: a hallucinated/echoed [INTERMEDIATE] token has no
      // business appearing in a user's own message either.
      currentUserText = stripFakeIntermediateTags(m.content || "");
      inTurn = true;
    } else if (m.role === "assistant") {
      const cleaned = cleanAi(m.content || "");
      if (inTurn) {
        currentAiText = currentAiText ? `${currentAiText}\n${cleaned}` : cleaned;
      } else {
        turns.push({
          turnNumber: turnNumber++,
          userText: "",
          aiText: cleaned.trim(),
        });
      }
    }
  }

  if (inTurn && (currentUserText || currentAiText)) {
    turns.push({
      turnNumber: turnNumber++,
      userText: currentUserText.trim(),
      aiText: currentAiText.trim(),
    });
  }

  return turns;
}

const TURNS_PER_PART = 5;

export function handleListHistory(turns: HistoryTurn[], part: number, limit = 500): string {
  const totalParts = Math.max(1, Math.ceil(turns.length / TURNS_PER_PART));
  const validPart = Math.min(totalParts, Math.max(1, part));

  if (turns.length === 0) {
    return `part(${part}/${totalParts}):\n(no previous conversation turns found)`;
  }

  const startIndex = (validPart - 1) * TURNS_PER_PART;
  const partTurns = turns.slice(startIndex, startIndex + TURNS_PER_PART);

  const lines: string[] = [`part(${part}/${totalParts}):`];

  for (const turn of partTurns) {
    let uText = turn.userText || "";
    if (uText.length > limit) {
      uText = uText.slice(0, limit) + "...";
    }
    let aText = turn.aiText || "";
    if (aText.length > limit) {
      aText = aText.slice(0, limit) + "...";
    }

    lines.push(`${turn.turnNumber}: user: ${uText}`);
    lines.push(`ai: ${aText}`);
  }

  return lines.join("\n");
}

export function handleSeeHistory(turns: HistoryTurn[], turnNumbers: number[], limit = 1100): string {
  if (turns.length === 0) {
    return "(no history found)";
  }

  const turnMap = new Map<number, HistoryTurn>();
  for (const t of turns) {
    turnMap.set(t.turnNumber, t);
  }

  const blocks: string[] = [];

  for (const num of turnNumbers) {
    const turn = turnMap.get(num);
    if (!turn) {
      blocks.push(`${num}: (turn not found)`);
      continue;
    }

    let uText = turn.userText || "";
    if (uText.length > limit) {
      uText = uText.slice(0, limit) + "...";
    }
    let aText = turn.aiText || "";
    if (aText.length > limit) {
      aText = aText.slice(0, limit) + "...";
    }

    blocks.push(`${turn.turnNumber}: user: ${uText}\nai: ${aText}`);
  }

  return blocks.join("\n");
}

export function handleListChatKeywords(turns: HistoryTurn[], keywords: string[]): string {
  if (turns.length === 0 || keywords.length === 0) {
    return "(no chat turns found)";
  }

  const matchingTurnNumbers: number[] = [];

  for (const turn of turns) {
    const userContent = (turn.userText || "").toLowerCase();
    const aiContent = (turn.aiText || "").toLowerCase();
    const combinedContent = `${userContent}\n${aiContent}`;

    const hasMatch = keywords.some((kw) => combinedContent.includes(kw.toLowerCase()));
    if (hasMatch) {
      matchingTurnNumbers.push(turn.turnNumber);
    }
  }

  if (matchingTurnNumbers.length === 0) {
    return "(no chat turns found)";
  }

  return matchingTurnNumbers.join(", ");
}

