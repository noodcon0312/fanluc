import React, { useState, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { formatMathInText } from "../utils/mathHelper";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ChatMessage as ChatMessageType, VirtualFile } from "../types";
import { parseThinkContent, cleanThoughtLines } from "../utils/parseThink";
import { RandomFontText } from "../utils/randomFont";
import { parseAskCommand, stripAskCommand } from "../utils/askHelper";
import { AskQuestionnaire } from "./AskQuestionnaire";
import { FileArtifactCard } from "./FileArtifactCard";
import { CommandLog, extractToolStepsFromText } from "./CommandLog";
import { MapEmbedCard, stripShowMapCommands } from "./MapEmbedCard";
import { StepGuideCard, extractStepGuides, stripStepGuideCommands } from "./StepGuideCard";
import { TabCard, extractTabCards, stripTabCardCommands } from "./TabCard";
import { ChartDisplayCard, extractChartDisplays, stripChartDisplayCommands } from "./ChartDisplayCard";
import { PieChartDisplayCard, extractPieChartDisplays, stripPieChartDisplayCommands } from "./PieChartDisplayCard";
import { TranslationCard } from "./TranslationCard";
import { stripTranslateCommands, deduplicateTranslationCards } from "../utils/translateHelper";
import { WeatherCard } from "./WeatherCard";
import { stripWeatherCommands } from "../utils/weatherHelper";
import { ImageSearchCard } from "./ImageSearchCard";
import { stripImageSearchCommands } from "../utils/imageSearch";
import { stripMcpCalls } from "../utils/mcpHelper";
import { McpPanel } from "./McpPanel";
import { stripAllFileCommands, parseWriteCommands, parseEditCommands, normalizeFilePath } from "../utils/fileCommands";
import { parseRunCmdCommands, applyReplaceOutputOverride, stripReplaceOutputCommands, stripRunCmdBgCommands } from "../utils/codeRunner";
import { TurtleCard, parseTurtleCardCommands, stripTurtleCardCommands } from "./TurtleCard";
import { stripWriteMemCommands, stripReadMemCommands } from "../utils/memHelper";
import { stripPromptAgentCommands, stripListAgentCommands, stripViewImageAgentCommands } from "../utils/agentHelper";
import { cleanAiCommands, extractAllFetchCommands } from "../utils/yahooSearch";
import { stripCustomTemplateTags } from "../utils/templateHelper";
import { SourcesList } from "./SourcesList";
import { MediaEmbed } from "../utils/mediaHelper";

interface MessageSegment {
  id: string;
  text: string;
  commandsText?: string;
  hasCommands: boolean;
}

function parseInterleavedSegments(
  rawText: string,
  thinkStartTag?: string,
  thinkEndTag?: string,
  stripOpenTags?: string,
  stripCloseTags?: string,
  isAiRoleSimEnabled?: boolean
): MessageSegment[] {
  const isHelpManualOrRoleSim = Boolean(
    isAiRoleSimEnabled ||
    rawText.includes("DEV_MODE TOOL COMMANDS MANUAL") ||
    rawText.includes("[DEV_MODE TOOL COMMANDS MANUAL (/help)]") ||
    rawText.includes("SYSTEM_INSTRUCTION: roleUser") ||
    rawText.includes("roleUser.ts")
  );

  if (isHelpManualOrRoleSim) {
    const thinkParsed = parseThinkContent(rawText, thinkStartTag, thinkEndTag);
    return [
      {
        id: "manual-0",
        text: thinkParsed.mainText,
        hasCommands: false,
      },
    ];
  }

  // replace_output{...}: when the AI decides something it already said
  // earlier IN THIS SAME TURN was wrong (e.g. it guessed, then a later
  // search/fetch turned up the real answer), it calls this instead of just
  // tacking a "sorry, actually..." sentence onto the end. This drops every
  // earlier round (and that round's own original text) up through the
  // round containing the LAST replace_output{...} call, splicing in its
  // text in its place, so the person only ever sees the corrected message —
  // never the trail of wrong attempts. A no-op when none is present.
  rawText = applyReplaceOutputOverride(rawText);

  const intermediateMatches = [...rawText.matchAll(/\[INTERMED(?:IATE|IUM|IAT|IA|I|U)?\]?([\s\S]*?)(?:\[\/INTERMED(?:IATE|IUM|IAT|IA|I|U)?\]?|$)/gi)];
  const finalPortion = rawText.replace(/\[INTERMED(?:IATE|IUM|IAT|IA|I|U)?\]?[\s\S]*?(?:\[\/INTERMED(?:IATE|IUM|IAT|IA|I|U)?\]?|$)/gi, '').trim();

  const cleanStepText = (s: string) => {
    const thinkParsed = parseThinkContent(s, thinkStartTag, thinkEndTag);
    const main = thinkParsed.mainText;
    const stripPipeline = [
      (t: string) => cleanAiCommands(t),
      stripShowMapCommands,
      stripStepGuideCommands,
      stripTabCardCommands,
      stripChartDisplayCommands,
      stripPieChartDisplayCommands,
      stripTranslateCommands,
      stripWeatherCommands,
      stripImageSearchCommands,
      stripMcpCalls,
      stripReplaceOutputCommands,
      stripTurtleCardCommands,
      stripRunCmdBgCommands,
      stripWriteMemCommands,
      stripReadMemCommands,
      stripPromptAgentCommands,
      stripListAgentCommands,
      stripViewImageAgentCommands,
    ];
    const stripped = stripPipeline.reduce((acc, fn) => fn(acc), stripCustomTemplateTags(main, stripOpenTags, stripCloseTags));
    return stripped
      .replace(/(?:^|\n)?\s*\[\/?INTERMED(?:IATE|IUM|IAT|IA|I|U)?\]?\s*(?:\n|$)?/gi, '\n')
      .replace(/(?:^|\n)\s*\[\s*\d+\s*\]\s*(?=\n|$)/gi, '\n')
      .replace(/\[\s*\d+\s*\]/g, '')
      .replace(/```[a-zA-Z0-9_\-]*\n*(?:call:)?(?:search|fetch|image_search|mcp_call|call_mcp|translate|show_weather|list_history|see_history|list_chat_keywords|load_skills|read_docs|run_js|run_py|run_cmd|write_file|edit_file|delete_file|read_file|move_file|glob|grep|git_diff|git_checkout|pie_chart|chart|tab_card|step_guide|show_map)\s*\([\s\S]*?\)\n*```/gi, "")
      .replace(/(?:^|\n)(?:call:)?(?:search|fetch|image_search|mcp_call|call_mcp|translate|show_weather|list_history|see_history|list_chat_keywords|load_skills|read_docs|run_js|run_py|run_cmd|write_file|edit_file|delete_file|read_file|move_file|glob|grep|git_diff|git_checkout|pie_chart|chart|tab_card|step_guide|show_map)\s*\([\s\S]*?\)(?:;)?(?=\n|$)/gi, "\n")
      .replace(/```[a-zA-Z0-9_\-]*\s*```/g, '')
      // Drop any line that is nothing but stray backtick(s) left over from a
      // single-backtick-wrapped tool call whose inner command text was already
      // stripped above (e.g. `show_weather(...)` -> ``). These orphan marks
      // have no meaning on their own and only clutter the chat visually.
      .replace(/^[ \t]*`{1,6}[ \t]*$/gm, '')
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const rawSegments: MessageSegment[] = [];

  if (intermediateMatches.length > 0) {
    intermediateMatches.forEach((match, idx) => {
      const blockRaw = match[1];
      const thinkParsed = parseThinkContent(blockRaw, thinkStartTag, thinkEndTag);
      const text = cleanStepText(blockRaw);
      const toolSteps = extractToolStepsFromText(thinkParsed.mainText, thinkStartTag, thinkEndTag);
      if (text.length > 0 || toolSteps.length > 0) {
        rawSegments.push({
          id: `intermediate-${idx}`,
          text,
          commandsText: toolSteps.length > 0 ? thinkParsed.mainText : undefined,
          hasCommands: toolSteps.length > 0,
        });
      }
    });

    if (finalPortion.length > 0) {
      const thinkParsed = parseThinkContent(finalPortion, thinkStartTag, thinkEndTag);
      const text = cleanStepText(finalPortion);
      const toolSteps = extractToolStepsFromText(thinkParsed.mainText, thinkStartTag, thinkEndTag);
      if (text.length > 0 || toolSteps.length > 0) {
        rawSegments.push({
          id: `final-portion`,
          text,
          commandsText: toolSteps.length > 0 ? thinkParsed.mainText : undefined,
          hasCommands: toolSteps.length > 0,
        });
      }
    }
  } else {
    const thinkParsed = parseThinkContent(rawText, thinkStartTag, thinkEndTag);
    const text = cleanStepText(rawText);
    const toolSteps = extractToolStepsFromText(thinkParsed.mainText, thinkStartTag, thinkEndTag);
    rawSegments.push({
      id: `single-0`,
      text,
      commandsText: toolSteps.length > 0 ? thinkParsed.mainText : undefined,
      hasCommands: toolSteps.length > 0,
    });
  }

  // Merge consecutive tool logs if they appear without intermediate text
  const mergedSegments: MessageSegment[] = [];
  for (const seg of rawSegments) {
    if (mergedSegments.length === 0) {
      mergedSegments.push({ ...seg });
      continue;
    }

    const last = mergedSegments[mergedSegments.length - 1];
    
    // Check if current segment is purely empty or just backticks
    // We only consider it "empty" if there are literally no alphanumeric chars or it's JUST backticks/quotes.
    const cleanCurrentText = seg.text.replace(/[\s`"']/g, '');
    const cleanLastText = last.text.replace(/[\s`"']/g, '');
    const isTextEmptyOrOnlyBackticks = cleanCurrentText === '';
    const lastIsTextEmptyOrOnlyBackticks = cleanLastText === '';

    // If both current and last have commands and text is basically empty, merge them
    if (isTextEmptyOrOnlyBackticks && seg.hasCommands && last.hasCommands) {
      last.commandsText = `${last.commandsText || ""}\n\n${seg.commandsText || ""}`;
      continue;
    }

    if (lastIsTextEmptyOrOnlyBackticks && last.hasCommands && seg.hasCommands) {
      last.commandsText = `${last.commandsText || ""}\n\n${seg.commandsText || ""}`;
      last.text = seg.text; // Take the current segment's text if any
      continue;
    }

    // If the segment has NO commands and is completely empty/just backticks, just drop it 
    // to avoid leaving random isolated backticks in the chat flow
    if (isTextEmptyOrOnlyBackticks && !seg.hasCommands) {
      continue;
    }
    
    // Clean trailing/leading loose quotes and backticks if they are orphaned
    let cleanText = seg.text.trim();
    if (cleanText.replace(/[\s`"']/g, '') === '') {
        cleanText = "";
    }
    seg.text = cleanText;

    mergedSegments.push({ ...seg });
  }

  return mergedSegments;
}

function stringifyReactNode(node: any): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(stringifyReactNode).join("");
  }
  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<any>;
    if (element.props && element.props.children !== undefined) {
      return stringifyReactNode(element.props.children);
    }
  }
  return "";
}

interface Props {
  message: ChatMessageType;
  onRetry?: () => void;
  onOpenSetupGuide?: () => void;
  customModelName?: string;
  onSelectAnswers?: (answersText: string) => void;
  isAnswered?: boolean;
  sessionFiles?: Record<string, VirtualFile>;
  onOpenArtifact?: (file: VirtualFile) => void;
  thinkStartTag?: string;
  thinkEndTag?: string;
  stripOpenTags?: string;
  stripCloseTags?: string;
  isStreaming?: boolean;
  isRawView?: boolean;
  isLoading?: boolean;
  isAiRoleSimEnabled?: boolean;
  onEditMessage?: (newText: string) => void;
  onBranchMessage?: () => void;
}

const TypingIndicator: React.FC<{ isStreaming: boolean }> = ({ isStreaming }) => {
  if (!isStreaming) return null;

  return (
    <div className="pt-2 flex items-center">
      <img
        src="/shrink_rotate.gif"
        alt=""
        className="w-14 h-14 object-contain select-none dark:hidden"
      />
      <img
        src="/msh_spin_inverted.gif"
        alt=""
        className="w-14 h-14 object-contain select-none hidden dark:block"
      />
    </div>
  );
};

const MultiLineCodeBlock: React.FC<{
  codeString: string;
  match: RegExpExecArray | null;
  copiedCode: string | null;
  onCopy: (code: string) => void;
}> = ({ codeString, match, copiedCode, onCopy }) => {
  const lines = codeString.split("\n");
  const isLong = lines.length > 10;
  const [isExpanded, setIsExpanded] = useState(!isLong);

  return (
    <div className="my-3 border border-black dark:border-white bg-black text-white dark:bg-black font-mono text-xs">
      <div
        onClick={() => {
          if (isLong) {
            setIsExpanded(!isExpanded);
          }
        }}
        className={`flex items-center justify-between px-3 py-1.5 border-b border-white/20 bg-black text-white select-none ${
          isLong ? "cursor-pointer hover:bg-black transition-colors" : ""
        }`}
      >
        <div className="flex items-center space-x-2.5 overflow-hidden">
          <span className="font-bold tracking-wider">
            <RandomFontText text={`[${match ? match[1].toUpperCase() : "CODE"}]`} />
          </span>
          {isLong && (
            <span className="text-[10px] opacity-70 border-l border-white/20 pl-2">
              <RandomFontText text={isExpanded ? "[HIDE]" : `[SHOW: ${lines.length} LINES]`} />
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCopy(codeString);
          }}
          className="hover:underline font-bold px-1.5 py-0.5 border border-white/40 hover:bg-white hover:text-black text-[10px] ml-2 shrink-0"
        >
          <RandomFontText text={copiedCode === codeString ? "[COPIED]" : "[COPY]"} />
        </button>
      </div>
      {(!isLong || isExpanded) && (
        <pre className="p-3 overflow-x-auto whitespace-pre leading-relaxed">
          <code><RandomFontText text={codeString} /></code>
        </pre>
      )}
    </div>
  );
};

const CodeBlock: React.FC<{
  className?: string;
  children: any;
  props: any;
  copiedCode: string | null;
  onCopy: (code: string) => void;
}> = ({ className, children, props, copiedCode, onCopy }) => {
  const match = /language-(\w+)/.exec(className || "");
  const codeString = stringifyReactNode(children).replace(/\n$/, "");

  if (!codeString.trim()) {
    return null;
  }

  const isInline = !match && !codeString.includes("\n");

  if (isInline) {
    return (
      <code
        className="font-mono text-xs px-1 py-0.5 border border-black/40 dark:border-white/40 bg-white dark:bg-black"
        {...props}
      >
        <RandomFontText text={codeString} />
      </code>
    );
  }

  return (
    <MultiLineCodeBlock
      codeString={codeString}
      match={match}
      copiedCode={copiedCode}
      onCopy={onCopy}
    />
  );
};

const UserMessageContent: React.FC<{ message: ChatMessageType }> = ({ message }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const rawLines = message.content.split("\n");
  const isLong = rawLines.length > 6;
  const remainingLines = rawLines.length - 6;

  let displayContent = message.content;
  if (isLong && !isExpanded) {
    const firstSix = rawLines.slice(0, 6);
    displayContent = [...firstSix, "..."].join("\n");
  }

  return (
    <div className="space-y-3 font-sans text-sm sm:text-base leading-relaxed tracking-wide">
      {message.attachment && (
        <div className="p-2 border border-current bg-white/10 dark:bg-black/10 font-mono text-xs">
          <div className="font-bold text-[11px] mb-1 uppercase">
            <RandomFontText text={`[ATTACHED_FILE: ${message.attachment.name}]`} />
          </div>
          {message.attachment.type === "image" && message.attachment.dataUrl && (
            <div className="my-2">
              <img
                src={message.attachment.dataUrl}
                alt={message.attachment.name}
                className="max-h-60 max-w-full object-contain border border-current"
              />
            </div>
          )}
          {message.attachment.type === "text" && message.attachment.textContent && (
            <pre className="p-2 border border-current bg-black/20 dark:bg-white/20 text-[10px] max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
              <RandomFontText
                text={
                  message.attachment.textContent.length > 500
                    ? message.attachment.textContent.slice(0, 500) + "...\n[CONTINUED]"
                    : message.attachment.textContent
                }
              />
            </pre>
          )}
        </div>
      )}
      <div className="whitespace-pre-wrap">
        <RandomFontText text={displayContent} />
      </div>
      {isLong && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[11px] font-mono font-bold uppercase px-2 py-0.5 border border-current hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-colors"
          >
            <RandomFontText
              text={
                isExpanded
                  ? "[HIDE]"
                  : `[SHOW +${remainingLines} ${remainingLines === 1 ? "LINE" : "LINES"}]`
              }
            />
          </button>
        </div>
      )}
    </div>
  );
};

export const ChatMessageComponent: React.FC<Props> = ({
  message,
  onRetry,
  onOpenSetupGuide,
  customModelName,
  onSelectAnswers,
  isAnswered = false,
  sessionFiles,
  onOpenArtifact,
  thinkStartTag = "<think>",
  thinkEndTag = "</think>",
  stripOpenTags,
  stripCloseTags,
  isStreaming = false,
  isRawView = false,
  isLoading = false,
  isAiRoleSimEnabled = false,
  onEditMessage,
  onBranchMessage,
}) => {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);

  // Parse content for assistant messages
  const parsed = isUser ? null : parseThinkContent(message.content, thinkStartTag, thinkEndTag);
  // Default think block collapsed state
  const [showThink, setShowThink] = useState(false);

  // Parse any ask(...) questionnaire command from the main text only
  const rawMainText = parsed ? parsed.mainText : message.content;
  const askData = !isUser && rawMainText ? parseAskCommand(rawMainText) : null;

  // Interleaved segments for assistant turns (text + corresponding tool logs)
  const segments = useMemo(() => {
    if (isUser) return [];
    const textToParse = askData ? stripAskCommand(rawMainText) : rawMainText;
    return parseInterleavedSegments(
      textToParse,
      thinkStartTag,
      thinkEndTag,
      stripOpenTags,
      stripCloseTags,
      isAiRoleSimEnabled
    );
  }, [isUser, askData, rawMainText, thinkStartTag, thinkEndTag, stripOpenTags, stripCloseTags, isAiRoleSimEnabled]);

  // Find files created or modified for this message (with real-time fallback)
  const matchingFiles: VirtualFile[] = useMemo(() => {
    if (isUser || !sessionFiles) return [];
    const candidates = new Set<string>();

    if (message.fileArtifacts && message.fileArtifacts.length > 0) {
      message.fileArtifacts.forEach((p) => candidates.add(p));
    }

    // Real-time fallback: extract candidate files from message content even before turn finishes
    if (rawMainText) {
      const writes = parseWriteCommands(rawMainText);
      writes.forEach((w) => candidates.add(w.filePath));
      const edits = parseEditCommands(rawMainText);
      edits.forEach((e) => candidates.add(e.filePath));

      const runCmds = parseRunCmdCommands(rawMainText);
      for (const rc of runCmds) {
        const fileMatches = rc.code.matchAll(/(?:cat\s*>\s*|>|tee\s+)(?:['"]?)(?:\/workspace\/)?([a-zA-Z0-9_\-./]+)(?:['"]?)/gi);
        for (const fm of fileMatches) {
          const fn = fm[1]?.trim();
          if (fn && !fn.startsWith("-") && !fn.includes("dev/null") && !fn.includes("EOF")) {
            candidates.add(fn);
          }
        }
      }
    }

    if (candidates.size === 0) return [];

    const result: VirtualFile[] = [];
    const seenPaths = new Set<string>();

    for (const p of candidates) {
      const norm = normalizeFilePath(p);
      const simpleName = norm.split("/").pop() || norm;
      const file =
        sessionFiles[p] ||
        sessionFiles[norm] ||
        sessionFiles[simpleName] ||
        sessionFiles[`workspace/${simpleName}`];
      if (file && !seenPaths.has(file.path)) {
        seenPaths.add(file.path);
        result.push(file);
      }
    }

    return result;
  }, [isUser, sessionFiles, message.fileArtifacts, rawMainText]);

  // Extract fetched web sources (strictly from main non-thinking text)
  const fetchedSources: string[] = useMemo(() => {
    if (isUser) return [];
    if (message.sources && message.sources.length > 0) {
      return message.sources;
    }
    const cmds = extractAllFetchCommands(rawMainText);
    return Array.from(new Set(cmds.map((c) => c.url))).filter(Boolean);
  }, [isUser, message.sources, rawMainText]);

  const handleCopyText = () => {
    navigator.clipboard.writeText(message.content);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleStartEdit = () => {
    setEditValue(message.content);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditValue(message.content);
  };

  const handleSubmitEdit = () => {
    const trimmed = editValue.trim();
    if (!trimmed || !onEditMessage) return;
    setIsEditing(false);
    onEditMessage(trimmed);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const markdownComponents = useMemo(() => ({
    h1: ({ children }: any) => (
      <h1 className="text-xl sm:text-2xl font-bold font-serif border-b border-current pb-1.5 mt-4 mb-3 uppercase tracking-wide">
        <RandomFontText>{children}</RandomFontText>
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-lg sm:text-xl font-bold font-serif mt-3.5 mb-2 uppercase tracking-wide border-b border-dotted border-current pb-1">
        <RandomFontText>{children}</RandomFontText>
      </h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-base sm:text-lg font-bold font-mono mt-3 mb-1.5 tracking-wider uppercase">
        <RandomFontText>{children}</RandomFontText>
      </h3>
    ),
    p: ({ children }: any) => (
      <p className="mb-2.5 leading-relaxed text-sm sm:text-base">
        <RandomFontText>{children}</RandomFontText>
      </p>
    ),
    img: ({ src, alt }: any) => <MediaEmbed src={src} alt={alt} />,
    a: ({ href, children }: any) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="font-bold underline hover:opacity-70"
      >
        <RandomFontText>{children}</RandomFontText>
      </a>
    ),
    hr: () => <hr className="my-4 border-t border-black dark:border-white" />,
    ul: ({ children }: any) => (
      <ul className="list-disc list-inside space-y-1.5 my-2.5 pl-2 text-sm sm:text-base leading-relaxed">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal list-inside space-y-1.5 my-2.5 pl-2 text-sm sm:text-base leading-relaxed">{children}</ol>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-2 border-black dark:border-white pl-3 italic my-2.5 py-1 opacity-90 text-sm sm:text-base">
        <RandomFontText>{children}</RandomFontText>
      </blockquote>
    ),
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-3">
        <table className="min-w-full border-collapse border border-black dark:border-white text-xs font-mono">
          {children}
        </table>
      </div>
    ),
    th: ({ children }: any) => (
      <th className="border border-black dark:border-white p-2 bg-black/10 dark:bg-white/10 font-bold uppercase text-left">
        <RandomFontText>{children}</RandomFontText>
      </th>
    ),
    td: ({ children }: any) => (
      <td className="border border-black dark:border-white p-2">
        <RandomFontText>{children}</RandomFontText>
      </td>
    ),
    pre: ({ children }: any) => <>{children}</>,
    code: ({ className, children, ...props }: any) => (
      <CodeBlock
        className={className}
        props={props}
        copiedCode={copiedCode}
        onCopy={handleCopyCode}
      >
        {children}
      </CodeBlock>
    ),
  }), [copiedCode]);

  // If RAW VIEW is enabled, render unstripped raw payload block (after all hooks have executed)
  if (isRawView) {
    return (
      <div className="w-full border-b border-black/20 dark:border-white/20 p-4 font-mono text-xs bg-black/5 dark:bg-white/5 space-y-2">
        <div className="flex items-center justify-between border-b border-black/30 dark:border-white/30 pb-1.5 opacity-80">
          <div className="flex items-center space-x-2">
            <span className="font-bold uppercase tracking-wider text-[11px]">
              [RAW_{message.role.toUpperCase()}_PAYLOAD]
            </span>
            <span className="text-[10px] opacity-60">
              ({message.content.length} chars | ~{Math.ceil(message.content.length / 4)} tokens)
            </span>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(message.content);
              setCopiedText(true);
              setTimeout(() => setCopiedText(false), 1500);
            }}
            className="text-[10px] font-bold uppercase px-2 py-0.5 border border-current hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
          >
            {copiedText ? "[COPIED]" : "[COPY_RAW]"}
          </button>
        </div>
        <pre className="p-3 bg-black text-white dark:bg-black dark:text-white border border-white/20 font-mono text-[11px] whitespace-pre-wrap overflow-x-auto max-h-[500px] overflow-y-auto leading-relaxed">
          {message.content}
        </pre>
      </div>
    );
  }

  if (isSystem) {
    return (
      <div className="my-2 p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs text-center uppercase tracking-wider">
        <RandomFontText text={`[SYSTEM PROMPT] ${message.content}`} />
      </div>
    );
  }

  return (
    <div
      className={`group my-3 p-3.5 sm:p-5 border transition-colors ${
        isUser
          ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black ml-1 sm:ml-4 md:ml-8"
          : "border-black dark:border-white bg-white text-black dark:bg-black dark:text-white mr-1 sm:mr-4 md:mr-8"
      }`}
    >
      {/* Header info */}
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-black/20 dark:border-white/20 font-mono text-xs uppercase tracking-widest">
        <span>
          <RandomFontText
            text={
              isUser
                ? "[USER]"
                : `[${(customModelName || "CUSTOM MODEL NAME").toUpperCase()}]`
            }
          />
        </span>
        <div className="flex items-center space-x-3">
          <span>
            <RandomFontText
              text={new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            />
          </span>
          {isUser && onEditMessage && !isEditing && (
            <button
              type="button"
              onClick={handleStartEdit}
              disabled={isLoading}
              title="Edit message"
              className="font-bold px-1 py-0.5 border border-current text-[10px] hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <RandomFontText text="[EDIT]" />
            </button>
          )}
          {!isUser && onBranchMessage && (
            <button
              type="button"
              onClick={onBranchMessage}
              disabled={isLoading}
              title="Branch into a new chat from here"
              className="font-bold px-1 py-0.5 border border-current text-[10px] hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <RandomFontText text="[BRANCH]" />
            </button>
          )}
          <button
            onClick={handleCopyText}
            className="font-bold px-1 py-0.5 border border-current text-[10px] hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
          >
            <RandomFontText text={copiedText ? "[COPIED]" : "[COPY]"} />
          </button>
        </div>
      </div>

      {/* Error State */}
      {message.status === "error" && (
        <div className="mb-3 p-3 border-2 border-dashed border-black dark:border-white bg-black text-white dark:bg-white dark:text-black font-mono text-xs">
          <div className="font-bold mb-1"><RandomFontText text="[API_CONNECTION_ERROR]" /></div>
          <div className="mb-2 opacity-90"><RandomFontText text={message.errorDetails || "Unable to get response from API Endpoint."} /></div>
          <div className="flex flex-wrap items-center gap-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-2 py-1 border border-white dark:border-black bg-white text-black dark:bg-black dark:text-white text-xs font-bold uppercase hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
              >
                <RandomFontText text="[RETRY]" />
              </button>
            )}
            {onOpenSetupGuide && (
              <button
                onClick={onOpenSetupGuide}
                className="px-2 py-1 border border-white dark:border-black bg-black text-white dark:bg-white dark:text-black font-bold uppercase text-xs hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-colors"
              >
                <RandomFontText text="[VIEW_SETUP_GUIDE]" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content Rendering */}
      {isUser ? (
        isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
              rows={Math.min(14, Math.max(3, editValue.split("\n").length))}
              className="w-full p-2 bg-white dark:bg-black text-black dark:text-white caret-black dark:caret-white border border-black dark:border-white font-sans text-sm sm:text-base leading-relaxed resize-y focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSubmitEdit}
                className="px-2 py-1 border border-current text-xs font-bold uppercase hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
              >
                <RandomFontText text="[RESEND]" />
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-2 py-1 border border-current text-xs font-bold uppercase hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
              >
                <RandomFontText text="[CANCEL]" />
              </button>
            </div>
          </div>
        ) : (
          <UserMessageContent message={message} />
        )
      ) : (
        <div className="space-y-3 font-sans text-sm sm:text-base leading-relaxed">
          {/* Collapsible think section if think content is parsed */}
          {parsed?.hasThought && cleanThoughtLines(parsed.thoughtText).trim() !== '' && (
            <div className="border border-black dark:border-white text-xs font-mono">
              <div
                className="flex items-center justify-between p-2 cursor-pointer hover:bg-white dark:hover:bg-black transition-colors select-none"
                onClick={() => {
                  if (!parsed.isThinking) {
                    setShowThink(!showThink);
                  }
                }}
              >
                <span className="font-bold uppercase tracking-wider">
                  <RandomFontText
                    text={
                      parsed.isThinking
                        ? "Thinking..."
                        : `Thought for ${message.durationSeconds || Math.max(1, Math.round((parsed.thoughtText.length / 50)))}s`
                    }
                  />
                </span>
                {!parsed.isThinking && (
                  <span className="p-1">
                    {showThink ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                )}
              </div>

              {(showThink || parsed.isThinking) && (
                <div className="p-3 border-t border-black dark:border-white bg-white dark:bg-black space-y-3 max-h-96 overflow-y-auto">
                  {message.thoughtSteps && message.thoughtSteps.length > 1 ? (
                    message.thoughtSteps
                      .map((s, idx) => ({
                        step: s.step || idx + 1,
                        durationSeconds: s.durationSeconds || 1,
                        text: cleanThoughtLines(s.text),
                      }))
                      .filter(s => s.text.length > 0)
                      .map((s, idx) => (
                        <div key={`thought-step-${idx}`} className="space-y-1">
                          <div className="font-bold opacity-75">
                            <RandomFontText text={`Step ${s.step} · ${s.durationSeconds}s`} />
                          </div>
                          <div className="pl-3 border-l-2 border-black/30 dark:border-white/30 whitespace-pre-wrap font-mono text-xs opacity-90 leading-relaxed">
                            <RandomFontText text={s.text} />
                          </div>
                        </div>
                      ))
                  ) : parsed.thoughts && parsed.thoughts.length > 1 ? (
                    parsed.thoughts
                      .map(p => cleanThoughtLines(p))
                      .filter(p => p.length > 0)
                      .map((piece, idx) => (
                        <div key={`thought-piece-${idx}`} className="space-y-1">
                          <div className="font-bold opacity-75">
                            <RandomFontText text={`Step ${idx + 1}`} />
                          </div>
                          <div className="pl-3 border-l-2 border-black/30 dark:border-white/30 whitespace-pre-wrap font-mono text-xs opacity-90 leading-relaxed">
                            <RandomFontText text={piece} />
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="whitespace-pre-wrap font-mono text-xs opacity-90 leading-relaxed">
                      <RandomFontText text={cleanThoughtLines(parsed.thoughtText)} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Interleaved segments: text and granular tool logs */}
          <div className="space-y-3">
            {segments.map((seg) => (
              <React.Fragment key={seg.id}>
                {seg.text && (
                  <div className="markdown-content space-y-2">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={markdownComponents}
                    >
                      {formatMathInText(seg.text)}
                    </ReactMarkdown>
                  </div>
                )}

                {seg.hasCommands && seg.commandsText && (
                  <CommandLog
                    text={seg.commandsText}
                    thinkStartTag={thinkStartTag}
                    thinkEndTag={thinkEndTag}
                    stripOpenTags={stripOpenTags}
                    stripCloseTags={stripCloseTags}
                  />
                )}
              </React.Fragment>
            ))}

            {/* Quick response interactive questionnaire */}
            {askData && askData.questions.length > 0 && (
              <AskQuestionnaire
                questions={askData.questions}
                disabled={isAnswered}
                onComplete={(answers) => {
                  if (onSelectAnswers) {
                    const responseText =
                      answers.length === 1
                        ? answers[0].answer
                        : answers.map((a) => `${a.question}: ${a.answer}`).join("\n");
                    onSelectAnswers(responseText);
                  }
                }}
              />
            )}

            {/* Map Cards */}
            {message.mapCards && message.mapCards.length > 0 && (
              <div className="space-y-2">
                {message.mapCards.map((mc, idx) => (
                  <MapEmbedCard key={idx} title={mc.title} places={mc.places} />
                ))}
              </div>
            )}

            {/* Step-by-step Interactive Guide Cards */}
            {((message.stepGuides && message.stepGuides.length > 0)
              ? message.stepGuides
              : extractStepGuides(rawMainText, thinkStartTag, thinkEndTag)
            ).map((guide, gIdx) => (
              <StepGuideCard key={`step-guide-${gIdx}`} steps={guide.steps} />
            ))}

            {/* Interactive Tab Display Cards */}
            {((message.tabCards && message.tabCards.length > 0)
              ? message.tabCards
              : extractTabCards(rawMainText, thinkStartTag, thinkEndTag)
            ).map((tabData, tIdx) => (
              <TabCard key={`tab-card-${tIdx}`} data={tabData} />
            ))}

            {/* Native Inline Chart Displays (chart_display_v0) */}
            {((message.charts && message.charts.length > 0)
              ? message.charts
              : extractChartDisplays(rawMainText, thinkStartTag, thinkEndTag)
            ).map((chartData, cIdx) => (
              <ChartDisplayCard key={`chart-card-${cIdx}`} data={chartData} />
            ))}

            {/* Native Inline Pie / Donut Chart Displays (pie_chart_display_v0) */}
            {((message.pieCharts && message.pieCharts.length > 0)
              ? message.pieCharts
              : extractPieChartDisplays(rawMainText, thinkStartTag, thinkEndTag)
            ).map((pieData, pIdx) => (
              <PieChartDisplayCard key={`pie-chart-card-${pIdx}`} data={pieData} />
            ))}

            {/* Turtle-graphics drawing cards (turtle_card{...}) */}
            {rawMainText &&
              parseTurtleCardCommands(rawMainText).map((cmd, uIdx) => (
                <TurtleCard key={`turtle-card-${uIdx}`} script={cmd.code} />
              ))}

            {/* Translation Cards */}
            {message.translations && message.translations.length > 0 && deduplicateTranslationCards(message.translations).map((transData, tIdx) => (
              <TranslationCard key={`trans-card-${tIdx}`} data={transData} />
            ))}

            {/* Weather Cards */}
            {message.weatherCards && message.weatherCards.length > 0 && message.weatherCards.map((weatherData, wIdx) => (
              <WeatherCard key={`weather-card-${wIdx}`} data={weatherData} showExport={false} />
            ))}

            {/* Image Search Cards (SearXNG images) */}
            {message.imageSearchCards && message.imageSearchCards.length > 0 && message.imageSearchCards.map((imgData, iIdx) => (
              <ImageSearchCard key={`img-card-${iIdx}`} images={imgData.images} query={imgData.query} />
            ))}

            {/* MCP Status Panel (for /mcps) */}
            {message.mcpStatus && message.mcpStatus.length >= 0 && (
              <McpPanel />
            )}

            {/* Created or modified file artifact cards */}
            {matchingFiles.length > 0 && onOpenArtifact && (
              <FileArtifactCard
                files={matchingFiles}
                onOpenArtifact={onOpenArtifact}
              />
            )}

            {/* Fetched Web Sources List */}
            {fetchedSources.length > 0 && (
              <SourcesList urls={fetchedSources} />
            )}

            {/* Typing indicator gif while AI is typing/generating */}
            <TypingIndicator isStreaming={isStreaming} />
          </div>
        </div>
      )}
    </div>
  );
};
