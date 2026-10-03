import { sendChatMessage } from "../../utils/api.js";
import { parseThinkContent } from "../../utils/parseThink.js";
import {
  parseWriteCommands,
  parseEditCommands,
  parseDeleteCommands,
  parseMoveCommands,
  parseGitDiffCommands,
  parseGitCheckoutCommands,
  parseReadCommands,
  parseGlobCommands,
  parseGrepCommands,
  executeWrite,
  executeEdit,
  executeDelete,
  executeMove,
  executeGitDiff,
  executeGitCheckout,
  executeRead,
  executeGlob,
  executeGrep,
  flushWorkspaceWrites,
  syncServerWorkspaceFiles,
} from "../../utils/fileCommands.js";
import {
  extractAllSearchCommands,
  extractAllFetchCommands,
  performYahooSearch,
  performFetchUrl,
  hasUnexecutedFetch,
  detectUnrecognizedOrMalformedCommands,
} from "../../utils/yahooSearch.js";
import {
  extractAllListHistoryCommands,
  extractAllSeeHistoryCommands,
  extractAllListKeywordsCommands,
  extractHistoryTurns,
  handleListHistory,
  handleSeeHistory,
  handleListChatKeywords,
} from "../../utils/historyHelper.js";
import {
  hasListSkillsCommand,
  parseLoadSkillsCommands,
  executeListSkills,
  executeLoadSkills,
} from "../../utils/skillHelper.js";
import { parseReadDocsCommands, executeReadDoc } from "../../utils/docsHelper.js";
import { parseRunCmdCommands, executeRunCmd } from "../../utils/codeRunner.js";
import {
  extractTranslateCommands,
  performTranslate,
  deduplicateTranslationCards,
} from "../../utils/translateHelper.js";
import { extractWeatherCommands, performWeatherFetch } from "../../utils/weatherHelper.js";
import { extractAllImageSearchCommands, performImageSearch } from "../../utils/imageSearch.js";
import { extractAllMcpCalls, callMcpTool } from "../../utils/mcpHelper.js";
import type { VirtualFile, ChatMessage, TranslationCardData } from "../../types.js";

export type PermissionMode = "ask" | "autoEdit" | "readOnly";

export interface AgentConfig {
  apiUrl: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  reasoningEffort?: string;
  effort?: string;
  thinkStartTag?: string;
  thinkEndTag?: string;
  skills?: unknown[];
  [key: string]: unknown;
}

export interface ToolEvent {
  id: string;
  name: string;
  input: string;
  status: "running" | "done" | "error";
  output?: string;
}

export interface AssistantMessage {
  id: string;
  role: "assistant";
  content: string;
  timestamp: number;
  fileArtifacts?: string[];
  durationSeconds?: number;
  thoughtSteps?: { step: number; durationSeconds: number; text: string }[];
  translations?: unknown[];
  weatherCards?: unknown[];
  imageSearchCards?: unknown[];
}

export interface AgentLoopOpts {
  apiMessagesPayload: { role: string; content: string }[];
  baseMessages: ChatMessage[];
  config: AgentConfig;
  fanlucMd?: { path: string; content: string } | null;
  text: string;
  currentSessionFiles: Record<string, VirtualFile>;
  signal?: AbortSignal;
  permission: PermissionMode;
  /** Ask the user to allow one file operation (ask mode). Returns true when allowed. */
  confirmFile?: (message: string) => Promise<boolean>;
  onChunk?: (fullContent: string) => void;
  onStatus?: (status: string | null) => void;
  onRawRequest?: (req: unknown) => void;
  onRawResponse?: (res: string) => void;
  onTool?: (ev: ToolEvent) => void;
}

export interface AgentLoopResult {
  assistantMessage: AssistantMessage;
  updatedFiles: Record<string, VirtualFile>;
  rawRequest: unknown;
  rawResponse: string;
}

const MAX_SEARCH_STEPS = 8;

const BLOCKED_WRITE = "Blocked by readOnly permission mode: file writes are disabled. Switch permission (Shift+Tab) to allow writes.";
const BLOCKED_SHELL = "Blocked by readOnly permission mode: shell commands are disabled. Switch permission (Shift+Tab) to allow them.";

export async function runAgentLoop(opts: AgentLoopOpts): Promise<AgentLoopResult> {
  const {
    baseMessages,
    config,
    signal,
    onChunk,
    onStatus,
    onRawRequest,
    onRawResponse,
    onTool,
    permission,
    confirmFile,
  } = opts;
  let currentSessionFiles = { ...opts.currentSessionFiles };
  const touchedFilesThisTurn = new Set<string>();
  const workingPayload = [...opts.apiMessagesPayload];
  const startPayloadLength = workingPayload.length;
  const turnStartTime = Date.now();
  const collectedThoughtSteps: { step: number; durationSeconds: number; text: string }[] = [];
  const generatedTranslationCards: TranslationCardData[] = [];
  const generatedWeatherCards: unknown[] = [];
  const generatedImageCards: unknown[] = [];
  let finalResponse = "";
  let rawRequest: unknown = null;
  let rawResponse = "";
  let searchSteps = 0;

  const gateFile = async (message: string): Promise<boolean> => {
    if (permission === "readOnly") return false;
    if (permission === "autoEdit") return true;
    if (confirmFile) return confirmFile(message);
    return false;
  };

  while (searchSteps < MAX_SEARCH_STEPS) {
    searchSteps++;
    const stepStartTime = Date.now();
    rawRequest = {
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      top_p: config.topP,
      top_k: config.topK,
      repeat_penalty: config.repeatPenalty,
      reasoning_effort: config.reasoningEffort,
      messages: workingPayload,
    };
    onRawRequest?.(rawRequest);
    const currentResponse = await sendChatMessage(
      workingPayload as { role: string; content: string | unknown[] }[],
      config as never,
      (chunkText) => {
        if (chunkText) onStatus?.(null);
        const since = workingPayload
          .slice(startPayloadLength)
          .filter((m) => m.role === "assistant")
          .map((m) => String(m.content));
        let fullContent = since.map((msg) => `[INTERMEDIATE]\n${msg}\n[/INTERMEDIATE]`).join("\n\n");
        if (fullContent) fullContent += "\n\n";
        fullContent += chunkText;
        onChunk?.(fullContent);
      },
      signal
    );
    rawResponse = currentResponse;
    onRawResponse?.(currentResponse);
    const stepDurationSeconds = Math.max(1, Math.round((Date.now() - stepStartTime) / 1e3));
    const stepThinkParsed = parseThinkContent(currentResponse, config.thinkStartTag || "<think>", config.thinkEndTag || "</think>");
    if (stepThinkParsed.hasThought && stepThinkParsed.thoughtText) {
      collectedThoughtSteps.push({ step: searchSteps, durationSeconds: stepDurationSeconds, text: stepThinkParsed.thoughtText });
    }
    const thinkParsed = parseThinkContent(currentResponse, config.thinkStartTag || "<think>", config.thinkEndTag || "</think>");
    const commandSourceText = thinkParsed.mainText;
    const writeCmds = parseWriteCommands(commandSourceText);
    const editCmds = parseEditCommands(commandSourceText);
    const deleteCmds = parseDeleteCommands(commandSourceText);
    const moveCmds = parseMoveCommands(commandSourceText);
    const gitDiffCmds = parseGitDiffCommands(commandSourceText);
    const gitCheckoutCmds = parseGitCheckoutCommands(commandSourceText);
    const readCmds = parseReadCommands(commandSourceText);
    const globCmds = parseGlobCommands(commandSourceText);
    const grepCmds = parseGrepCommands(commandSourceText);
    const allSearchCmds = extractAllSearchCommands(commandSourceText);
    const allFetchCmds = extractAllFetchCommands(commandSourceText);
    const allListHistoryCmds = extractAllListHistoryCommands(commandSourceText);
    const allSeeHistoryCmds = extractAllSeeHistoryCommands(commandSourceText);
    const allListKeywordsCmds = extractAllListKeywordsCommands(commandSourceText);
    const hasListSkills = hasListSkillsCommand(commandSourceText);
    const loadSkillsCmds = parseLoadSkillsCommands(commandSourceText);
    const readDocsCmds = parseReadDocsCommands(commandSourceText);
    const runCmdCmds = parseRunCmdCommands(commandSourceText);
    const hasFailedFetch = hasUnexecutedFetch(commandSourceText);
    const hasUnrecognizedCmd = detectUnrecognizedOrMalformedCommands(commandSourceText);
    const allTranslateCmds = extractTranslateCommands(commandSourceText);
    const weatherCmds = extractWeatherCommands(commandSourceText);
    const allImageSearchCmds = extractAllImageSearchCommands(commandSourceText);
    const allMcpCallCmds = extractAllMcpCalls(commandSourceText);

    const totalCommandsCount =
      writeCmds.length + editCmds.length + deleteCmds.length + moveCmds.length +
      gitDiffCmds.length + gitCheckoutCmds.length + readCmds.length + globCmds.length +
      grepCmds.length + allSearchCmds.length + allFetchCmds.length + allListHistoryCmds.length +
      allSeeHistoryCmds.length + allListKeywordsCmds.length + (hasListSkills ? 1 : 0) +
      loadSkillsCmds.length + readDocsCmds.length + runCmdCmds.length + allTranslateCmds.length +
      weatherCmds.length + allImageSearchCmds.length + allMcpCallCmds.length;

    if (totalCommandsCount > 0 || hasFailedFetch || hasUnrecognizedCmd) {
      const combinedOutputs: string[] = [];
      let openTool: ToolEvent | null = null;
      let toolSeq = 0;
      const toolStart = (name: string, input: string) => {
        if (openTool) {
          openTool.status = "error";
          openTool.output = openTool.output ?? "(no output)";
          onTool?.({ ...openTool });
        }
        openTool = { id: `t${Date.now()}-${++toolSeq}`, name, input: String(input ?? ""), status: "running" };
        onTool?.({ ...openTool });
      };
      const toolFinish = (out: string) => {
        if (!openTool) return;
        const bad =
          /^\s*(error|\[[^\]]*error|blocked|failed|you entered an incorrect url)/i.test(out || "") ||
          /Blocked by permission/i.test(out || "");
        openTool.status = bad ? "error" : "done";
        openTool.output = out;
        onTool?.({ ...openTool });
        openTool = null;
      };
      const push = (out: string) => {
        toolFinish(String(out ?? ""));
        combinedOutputs.push(String(out ?? ""));
      };

      for (const w of writeCmds) {
        onStatus?.(`Creating file ${w.filePath}...`);
        toolStart("Write", w.filePath);
        if (!(await gateFile(`Write file ${w.filePath}`))) {
          push(permission === "readOnly" ? BLOCKED_WRITE : "Denied by user: file was NOT written.");
          continue;
        }
        const res = executeWrite(currentSessionFiles, w.filePath, w.content);
        currentSessionFiles = res.updatedFiles;
        touchedFilesThisTurn.add(res.savedFile.path);
        push(res.result);
      }
      for (const e of editCmds) {
        onStatus?.(`Editing file ${e.filePath}...`);
        toolStart("Edit", e.filePath);
        if (!(await gateFile(`Edit file ${e.filePath}`))) {
          push(permission === "readOnly" ? BLOCKED_WRITE : "Denied by user: file was NOT edited.");
          continue;
        }
        const res = executeEdit(currentSessionFiles, e.filePath, e.oldString, e.newString, e.replaceAll);
        currentSessionFiles = res.updatedFiles;
        if (res.savedFile) touchedFilesThisTurn.add(res.savedFile.path);
        push(res.result);
      }
      for (const d of deleteCmds) {
        onStatus?.(`Deleting file ${d.filePath}...`);
        toolStart("Delete", d.filePath);
        if (!(await gateFile(`Delete ${d.filePath}`))) {
          push(permission === "readOnly" ? BLOCKED_WRITE : "Denied by user: nothing was deleted.");
          continue;
        }
        const res = executeDelete(currentSessionFiles, d.filePath);
        currentSessionFiles = res.updatedFiles;
        if (res.deletedPath) touchedFilesThisTurn.delete(res.deletedPath);
        push(res.result);
      }
      for (const m of moveCmds) {
        onStatus?.(`Moving file ${m.sourcePath} -> ${m.destinationPath}...`);
        toolStart("Move", `${m.sourcePath} -> ${m.destinationPath}`);
        if (!(await gateFile(`Move ${m.sourcePath} -> ${m.destinationPath}`))) {
          push(permission === "readOnly" ? BLOCKED_WRITE : "Denied by user: nothing was moved.");
          continue;
        }
        const res = executeMove(currentSessionFiles, m.sourcePath, m.destinationPath);
        currentSessionFiles = res.updatedFiles;
        if (res.movedFile) {
          touchedFilesThisTurn.delete(m.sourcePath);
          touchedFilesThisTurn.add(res.movedFile.path);
        }
        push(res.result);
      }
      for (const df of gitDiffCmds) {
        onStatus?.(`Checking git diff ${df.filePath}...`);
        toolStart("GitDiff", df.filePath);
        push(executeGitDiff(currentSessionFiles, df.filePath));
      }
      for (const co of gitCheckoutCmds) {
        onStatus?.(`Reverting file (git checkout) ${co.filePath}...`);
        toolStart("GitCheckout", co.filePath);
        if (!(await gateFile(`Revert file ${co.filePath} (git checkout)`))) {
          push(permission === "readOnly" ? BLOCKED_WRITE : "Denied by user: file was NOT reverted.");
          continue;
        }
        const res = executeGitCheckout(currentSessionFiles, co.filePath);
        currentSessionFiles = res.updatedFiles;
        if (res.revertedFile) touchedFilesThisTurn.add(res.revertedFile.path);
        push(res.result);
      }
      for (const r of readCmds) {
        onStatus?.(`Reading file ${r.filePath}...`);
        toolStart("Read", r.filePath);
        push(executeRead(currentSessionFiles, r.filePath, r.offset, r.limit));
      }
      for (const g of globCmds) {
        onStatus?.(`Listing directory ${g.pattern}...`);
        toolStart("Glob", g.pattern);
        push(executeGlob(currentSessionFiles, g.pattern, g.path));
      }
      for (const gr of grepCmds) {
        onStatus?.(`Searching inside files ${gr.pattern}...`);
        toolStart("Grep", gr.pattern);
        push(executeGrep(currentSessionFiles, gr.pattern, gr.path, gr.glob));
      }
      for (const s of allSearchCmds) {
        onStatus?.(`Searching the web: "${s.query}"...`);
        toolStart("WebSearch", s.query);
        push(await performYahooSearch(s.query, s.count));
      }
      for (const f of allFetchCmds) {
        onStatus?.(`Fetching URL ${f.url.slice(0, 30)}...`);
        toolStart("WebFetch", f.url);
        const txt = await performFetchUrl(f.url, f.length);
        push(txt && txt.trim() ? txt : "you entered an incorrect URL, are missing characters, or the website no longer exists");
      }
      for (const lh of allListHistoryCmds) {
        onStatus?.(`Reading chat history part ${lh.part}...`);
        toolStart("History", `part ${lh.part}`);
        const turns = extractHistoryTurns(baseMessages);
        push(handleListHistory(turns, lh.part, lh.limit));
      }
      for (const sh of allSeeHistoryCmds) {
        onStatus?.(`Viewing chat turns ${sh.turnNumbers.join(", ")}...`);
        toolStart("History", `turns ${sh.turnNumbers.join(", ")}`);
        const turns = extractHistoryTurns(baseMessages);
        push(handleSeeHistory(turns, sh.turnNumbers, sh.limit));
      }
      for (const lk of allListKeywordsCmds) {
        onStatus?.(`Searching chat history for ${lk.keywords.join(", ")}...`);
        toolStart("History", lk.keywords.join(", "));
        const turns = extractHistoryTurns(baseMessages);
        push(handleListChatKeywords(turns, lk.keywords));
      }
      for (const cmd of runCmdCmds) {
        onStatus?.(`Running command...`);
        toolStart("Bash", cmd.code);
        if (permission === "readOnly") {
          push(BLOCKED_SHELL);
          continue;
        }
        push(await executeRunCmd(cmd.code));
      }
      // Wait for all disk uploads first: syncing while an upload is still
      // in flight would overwrite the virtual map with stale disk state.
      const flushBad = await flushWorkspaceWrites();
      if (flushBad.length) {
        push(`error: could NOT save to disk: ${flushBad.join(", ")}. The change is kept in context only; tell the user.`);
      }
      currentSessionFiles = await syncServerWorkspaceFiles(currentSessionFiles);
      if (hasListSkills) {
        onStatus?.("Listing available skills...");
        toolStart("Skills", "list");
        push(executeListSkills(opts.config.skills || [], opts.text));
      }
      for (const ls of loadSkillsCmds) {
        onStatus?.(`Loading skill(s): ${ls.skillIds.join(", ")}...`);
        toolStart("Skills", ls.skillIds.join(", "));
        push(executeLoadSkills(opts.config.skills || [], ls.skillIds, opts.text));
      }
      for (const rd of readDocsCmds) {
        onStatus?.(`Reading doc ${rd.docName}...`);
        toolStart("Docs", rd.docName);
        push(await executeReadDoc(rd.docName));
      }
      for (const tCmd of allTranslateCmds) {
        onStatus?.(`Translating text: "${tCmd.text.slice(0, 25)}..."...`);
        toolStart("Translate", tCmd.text.slice(0, 60));
        const card = await performTranslate(tCmd);
        generatedTranslationCards.push(card);
        push(card.error ? `Translation error: ${card.error}` : `[TRANSLATION RESULT: "${card.originalText}" (${card.fromLang ?? "auto"} -> ${card.toLang}): "${card.translatedText}"]`);
      }
      for (const wCmd of weatherCmds) {
        onStatus?.(`Fetching weather for ${wCmd.location}...`);
        toolStart("Weather", wCmd.location);
        const card = await performWeatherFetch(wCmd);
        generatedWeatherCards.push(card);
        push(card.error ? `Weather fetch error: ${card.error}` : `[WEATHER RESULT: ${card.location} - ${card.temperature}C, ${card.condition}]`);
      }
      for (const imCmd of allImageSearchCmds) {
        onStatus?.(`Searching images: "${imCmd.query}"...`);
        toolStart("ImageSearch", imCmd.query);
        const { images, formattedText } = await performImageSearch(imCmd.query, imCmd.count);
        generatedImageCards.push({ query: imCmd.query, images, count: images.length });
        push(formattedText || `Displayed ${images.length} images for "${imCmd.query}"`);
      }
      for (const mCmd of allMcpCallCmds) {
        onStatus?.(`Calling MCP ${mCmd.server}.${mCmd.tool}...`);
        toolStart(`mcp:${mCmd.server}`, `${mCmd.tool} ${JSON.stringify(mCmd.args ?? {}).slice(0, 120)}`);
        try {
          const mRes = await callMcpTool(mCmd.server, mCmd.tool, mCmd.args);
          const content = (mRes as { content?: { text?: string }[] })?.content;
          const textOut = Array.isArray(content)
            ? content.map((b) => b.text || JSON.stringify(b)).join("\n")
            : JSON.stringify(mRes).slice(0, 4000);
          push(`[MCP ${mCmd.server}.${mCmd.tool} result]: ${textOut}`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          push(`[MCP ${mCmd.server}.${mCmd.tool} error]: ${msg}`);
        }
      }
      if (allFetchCmds.length === 0 && hasFailedFetch) {
        onStatus?.("[FETCH_URL_FAILED]");
        push("you entered an incorrect URL, are missing characters, or the website no longer exists");
      }
      if (combinedOutputs.length === 0 && hasUnrecognizedCmd) {
        onStatus?.("[COMMAND_ERROR]");
        push("error: command detected but returned no output or had invalid arguments.");
      }
      const sanitizedOutputs = combinedOutputs.map((out) =>
        !out || typeof out !== "string" || !out.trim() ? "error" : out
      );
      if (sanitizedOutputs.length === 0) sanitizedOutputs.push("error");
      workingPayload.push({ role: "assistant", content: currentResponse });
      workingPayload.push({ role: "user", content: sanitizedOutputs.join("\n\n") });
      onStatus?.(null);
      continue;
    } else {
      finalResponse = currentResponse;
      onStatus?.(null);
      break;
    }
  }
  const finalThinkParsed = parseThinkContent(finalResponse || "", config.thinkStartTag || "<think>", config.thinkEndTag || "</think>");
  const finalCommandSourceText = finalThinkParsed.mainText;
  const trailingWrites = parseWriteCommands(finalCommandSourceText);
  for (const w of trailingWrites) {
    if (permission === "readOnly") break;
    if (permission === "ask" && confirmFile) {
      const ok = await confirmFile(`Write file ${w.filePath}`);
      if (!ok) continue;
    }
    const res = executeWrite(currentSessionFiles, w.filePath, w.content);
    currentSessionFiles = res.updatedFiles;
    touchedFilesThisTurn.add(res.savedFile.path);
  }
  await flushWorkspaceWrites();
  currentSessionFiles = await syncServerWorkspaceFiles(currentSessionFiles);
  const fileArtifactsList = Array.from(touchedFilesThisTurn);
  const totalTurnDurationSeconds = Math.max(1, Math.round((Date.now() - turnStartTime) / 1e3));
  const aiMessagesSinceStart = workingPayload
    .slice(startPayloadLength)
    .filter((m) => m.role === "assistant")
    .map((m) => String(m.content));
  let fullTurnRawContent = aiMessagesSinceStart
    .map((msg) => `[INTERMEDIATE]\n${msg}\n[/INTERMEDIATE]`)
    .join("\n\n");
  if (finalResponse) {
    if (fullTurnRawContent) fullTurnRawContent += "\n\n";
    fullTurnRawContent += finalResponse;
  }
  const assistantMessage: AssistantMessage = {
    id: (Date.now() + 1).toString(),
    role: "assistant",
    content: fullTurnRawContent,
    timestamp: Date.now(),
    fileArtifacts: fileArtifactsList.length > 0 ? fileArtifactsList : undefined,
    durationSeconds: totalTurnDurationSeconds,
    thoughtSteps: collectedThoughtSteps.length > 0 ? collectedThoughtSteps : undefined,
    translations: deduplicateTranslationCards(generatedTranslationCards).length > 0
      ? deduplicateTranslationCards(generatedTranslationCards)
      : undefined,
    weatherCards: generatedWeatherCards.length > 0 ? generatedWeatherCards : undefined,
    imageSearchCards: generatedImageCards.length > 0 ? generatedImageCards : undefined,
  };
  return { assistantMessage, updatedFiles: currentSessionFiles, rawRequest, rawResponse };
}
