import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { formatMathInText } from "../utils/mathHelper";
import { Check, Copy } from "lucide-react";
import { TabCardData, TabCardMode, TabCheckboxItem, TabItem } from "../types";
import { parseThinkContent } from "../utils/parseThink";
import { RandomFontText } from "../utils/randomFont";
import { MediaEmbed } from "../utils/mediaHelper";

export interface TabCardProps {
  data: TabCardData;
}

/**
 * Regex matching the Tab display card block format:
 * ---
 * |Tab display card|
 * - tab 1: content
 * - tab 2: (checkbox) content
 * [none, copy, need_complete]
 * ---
 */
export const TAB_CARD_REGEX =
  /(?:^|\n)(?:```[a-z]*\s*\n)?\s*-{3,}\s*\n\s*\|Tab display card\|\s*\n([\s\S]*?)(?:\n\s*-{3,}|\n\s*```|$)/gi;

/**
 * Parse all tab display card blocks from model output text.
 * Requires 2 to 8 tabs. Tab titles up to 20 chars, content up to 800 chars.
 * Strips think tags so instructions drafted inside <think> are strictly ignored.
 */
export function extractTabCards(
  text: string,
  thinkStartTag?: string,
  thinkEndTag?: string
): TabCardData[] {
  if (!text || typeof text !== "string") return [];
  const thinkParsed = parseThinkContent(text, thinkStartTag, thinkEndTag);
  const targetText = thinkParsed.mainText;
  if (!targetText) return [];

  const results: TabCardData[] = [];
  const regex = new RegExp(TAB_CARD_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(targetText)) !== null) {
    try {
      const blockContent = match[1];
      const lines = blockContent.split("\n");

      let mode: TabCardMode = "none";
      const rawTabs: { title: string; contentLines: string[] }[] = [];
      let currentTab: { title: string; contentLines: string[] } | null = null;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
          if (currentTab) currentTab.contentLines.push("");
          continue;
        }

        if (line.startsWith("---") || line.startsWith("```")) continue;

        // Check for mode line: [none], [copy], [need_complete]
        const modeMatch = line.match(/^\[\s*(none|copy|need_complete)\s*\]$/i);
        if (modeMatch) {
          mode = modeMatch[1].toLowerCase() as TabCardMode;
          continue;
        }

        // Check for multi-option prompt line like [none, copy, need_complete]
        if (/^\[.*(none|copy|need_complete).*\]$/i.test(line)) {
          if (/need_complete/i.test(line) && !/none.*copy/i.test(line)) {
            mode = "need_complete";
          } else if (/copy/i.test(line) && !/none/i.test(line)) {
            mode = "copy";
          } else {
            mode = "none";
          }
          continue;
        }

        // Check for tab header: "- tab name:" or "- tab name: initial content"
        const tabHeaderMatch = line.match(/^-\s*([^:\n]+)\s*:\s*([\s\S]*)$/);
        if (tabHeaderMatch) {
          const rawTitle = tabHeaderMatch[1].trim().slice(0, 20);
          const initialContent = tabHeaderMatch[2]?.trim() || "";

          currentTab = {
            title: rawTitle || `Tab ${rawTabs.length + 1}`,
            contentLines: initialContent ? [initialContent] : [],
          };
          rawTabs.push(currentTab);
        } else if (currentTab) {
          currentTab.contentLines.push(line);
        }
      }

      // Process parsed tabs
      const tabs: TabItem[] = [];
      for (const rt of rawTabs) {
        const rawContent = rt.contentLines.join("\n").trim().slice(0, 800);
        const parsedCheckboxes: TabCheckboxItem[] = [];
        const nonCheckboxLines: string[] = [];

        const cLines = rawContent.split("\n");
        let cbIndex = 0;

        for (const cl of cLines) {
          const trimmed = cl.trim();
          // Match lines with (checkbox), [ ], [x], etc.
          const cbMatch = trimmed.match(
            /^(?:-\s*|\*\s*|\d+[\.)]\s*)?(?:\((?:checkbox)\)|\[\s*[xX ]?\s*\])\s*([\s\S]*)$/i
          );

          if (cbMatch) {
            const label = cbMatch[1].trim();
            const isInitiallyChecked = /\[[xX]\]/i.test(trimmed);
            parsedCheckboxes.push({
              id: `cb-${cbIndex++}`,
              label: label || "Check to complete",
              checked: isInitiallyChecked,
            });
          } else {
            nonCheckboxLines.push(cl);
          }
        }

        tabs.push({
          title: rt.title,
          content: nonCheckboxLines.join("\n").trim(),
          checkboxes: parsedCheckboxes.length > 0 ? parsedCheckboxes : undefined,
        });
      }

      // Check tab count constraints: min 2 tabs, max 8 tabs
      if (tabs.length >= 2 && tabs.length <= 8) {
        results.push({ tabs, mode });
      } else if (tabs.length >= 1) {
        // Fallback if 1 or more than 8
        results.push({ tabs: tabs.slice(0, 8), mode });
      }
    } catch {
      continue;
    }
  }

  return results;
}

/**
 * Strip tab display card block syntax from text to display clean markdown.
 */
export function stripTabCardCommands(text: string): string {
  if (!text) return "";
  return text
    .replace(
      /(?:^|\n)(?:```[a-z]*\s*\n)?\s*-{3,}\s*\n\s*\|Tab display card\|\s*\n[\s\S]*?(?:\n\s*-{3,}|\n\s*```|$)/gi,
      "\n"
    )
    .trim();
}

export const TabCard: React.FC<TabCardProps> = ({ data }) => {
  const { tabs, mode } = data;
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [checkboxStates, setCheckboxStates] = useState<Record<string, boolean>>({});

  if (!tabs || tabs.length === 0) return null;

  const currentTab = tabs[activeTabIndex] || tabs[0];
  const totalTabs = tabs.length;

  const handleCopy = () => {
    const fullTabContent = [
      currentTab.title,
      currentTab.content,
      ...(currentTab.checkboxes?.map((c) => `[${checkboxStates[c.id] ? "X" : " "}] ${c.label}`) || []),
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard.writeText(fullTabContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleCheckbox = (id: string) => {
    setCheckboxStates((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleNextOrDone = () => {
    if (activeTabIndex < totalTabs - 1) {
      setActiveTabIndex((prev) => prev + 1);
    } else {
      setCompleted(true);
    }
  };

  return (
    <div className="w-full my-3 border border-black dark:border-white bg-white dark:bg-black font-sans rounded-none overflow-hidden select-none">
      {/* Header Tab Bar */}
      <div className="flex border-b border-black/20 dark:border-white/20 bg-white dark:bg-black overflow-x-auto scrollbar-none">
        {tabs.map((tab, idx) => {
          const isActive = idx === activeTabIndex;
          return (
            <button
              key={`tab-btn-${idx}`}
              type="button"
              onClick={() => {
                setActiveTabIndex(idx);
                if (completed && idx < totalTabs - 1) {
                  setCompleted(false);
                }
              }}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-mono tracking-wide border-r border-black/10 dark:border-white/10 transition-colors shrink-0 ${
                isActive
                  ? "bg-white dark:bg-black text-black dark:text-white font-bold border-b-2 border-b-black dark:border-b-white"
                  : "text-black dark:text-white hover:text-black dark:hover:text-white hover:bg-white/60 dark:hover:bg-black/60"
              }`}
            >
              <RandomFontText text={tab.title} />
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="p-4 sm:p-5 min-h-[90px] bg-white dark:bg-black text-black dark:text-white">
        {currentTab.content && (
          <div className="w-full text-sm sm:text-base leading-relaxed font-sans mb-3">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed"><RandomFontText>{children}</RandomFontText></p>,
                strong: ({ children }) => (
                  <strong className="font-bold underline decoration-1 underline-offset-2">
                    <RandomFontText>{children}</RandomFontText>
                  </strong>
                ),
                em: ({ children }) => <em className="italic font-mono"><RandomFontText>{children}</RandomFontText></em>,
                code: ({ children }) => (
                  <code className="font-mono text-xs px-1.5 py-0.5 border border-black/30 dark:border-white/30 bg-white dark:bg-black">
                    <RandomFontText>{children}</RandomFontText>
                  </code>
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
              }}
            >
              {formatMathInText(currentTab.content)}
            </ReactMarkdown>
          </div>
        )}

        {/* Checkbox Items (if present in tab) */}
        {currentTab.checkboxes && currentTab.checkboxes.length > 0 && (
          <div className="space-y-2 mt-3 pt-2 border-t border-black/10 dark:border-white/10">
            {currentTab.checkboxes.map((cb) => {
              const isChecked = checkboxStates[cb.id] ?? cb.checked;
              return (
                <label
                  key={cb.id}
                  onClick={() => toggleCheckbox(cb.id)}
                  className="flex items-start gap-2.5 cursor-pointer text-xs sm:text-sm font-mono select-none hover:opacity-80 transition-opacity"
                >
                  <div
                    className={`w-4 h-4 mt-0.5 border border-black dark:border-white flex items-center justify-center shrink-0 ${
                      isChecked ? "bg-black text-white dark:bg-white dark:text-black" : "bg-white dark:bg-black"
                    }`}
                  >
                    {isChecked && <Check size={12} strokeWidth={3} />}
                  </div>
                  <span className={isChecked ? "line-through opacity-60" : ""}>
                    <RandomFontText text={cb.label} />
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Footer Actions based on Mode */}
      <div className="flex items-center justify-between px-3 py-2 bg-white dark:bg-black border-t border-black/20 dark:border-white/20 text-xs font-mono">
        <div className="text-black dark:text-white font-mono text-xs">
          <RandomFontText text={`TAB ${activeTabIndex + 1}/${totalTabs}`} />
        </div>

        <div className="flex items-center gap-2">
          {mode === "copy" && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1 border border-black/30 dark:border-white/30 bg-white dark:bg-black text-black dark:text-white font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
            >
              {copied ? (
                <>
                  <Check size={12} />
                  <RandomFontText text="[COPIED]" />
                </>
              ) : (
                <>
                  <Copy size={12} />
                  <RandomFontText text="[COPY]" />
                </>
              )}
            </button>
          )}

          {mode === "need_complete" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTabIndex((prev) => Math.max(0, prev - 1))}
                disabled={activeTabIndex === 0}
                className="px-2.5 py-1 border border-black/30 dark:border-white/30 bg-white dark:bg-black text-black dark:text-white font-bold disabled:opacity-25 disabled:cursor-not-allowed hover:enabled:bg-black hover:enabled:text-white dark:hover:enabled:bg-white dark:hover:enabled:text-black transition-colors"
              >
                <RandomFontText text="[PREV]" />
              </button>

              <button
                type="button"
                onClick={handleNextOrDone}
                className={`px-3 py-1 border border-black/30 dark:border-white/30 font-bold transition-colors ${
                  completed && activeTabIndex === totalTabs - 1
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "bg-white dark:bg-black text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                }`}
              >
                <RandomFontText
                  text={
                    activeTabIndex < totalTabs - 1
                      ? "[NEXT]"
                      : completed
                      ? "[COMPLETED]"
                      : "[DONE]"
                  }
                />
              </button>
            </div>
          )}

          {mode === "none" && totalTabs > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTabIndex((prev) => Math.max(0, prev - 1))}
                disabled={activeTabIndex === 0}
                className="px-2.5 py-0.5 border border-black/30 dark:border-white/30 bg-white dark:bg-black text-black dark:text-white font-bold disabled:opacity-25 disabled:cursor-not-allowed hover:enabled:bg-black hover:enabled:text-white dark:hover:enabled:bg-white dark:hover:enabled:text-black transition-colors"
              >
                {"<"}
              </button>
              <button
                type="button"
                onClick={() => setActiveTabIndex((prev) => Math.min(totalTabs - 1, prev + 1))}
                disabled={activeTabIndex === totalTabs - 1}
                className="px-2.5 py-0.5 border border-black/30 dark:border-white/30 bg-white dark:bg-black text-black dark:text-white font-bold disabled:opacity-25 disabled:cursor-not-allowed hover:enabled:bg-black hover:enabled:text-white dark:hover:enabled:bg-white dark:hover:enabled:text-black transition-colors"
              >
                {">"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
