import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { formatMathInText } from "../utils/mathHelper";
import { StepGuideData } from "../types";
import { parseThinkContent } from "../utils/parseThink";
import { MediaEmbed } from "../utils/mediaHelper";
import { RandomFontText } from "../utils/randomFont";

export interface StepGuideCardProps {
  steps: string[];
  initialStep?: number;
}

/**
 * Regex matching the Step-by-step guide block format:
 * ---
 * |Step-by-step guide|
 * 1: ...
 * 2: ...
 * 3: ...
 * ---
 */
export const STEP_GUIDE_REGEX =
  /(?:^|\n)(?:```[a-z]*\s*\n)?\s*-{3,}\s*\n\s*\|Step-by-step guide\|\s*\n([\s\S]*?)(?:\n\s*-{3,}|\n\s*```|$)/gi;

/**
 * Parse all step-by-step guide blocks from model output text.
 * Requires 3 to 20 numbered steps.
 * Strips think tags so instructions drafted inside <think> are strictly ignored.
 */
export function extractStepGuides(
  text: string,
  thinkStartTag?: string,
  thinkEndTag?: string
): StepGuideData[] {
  if (!text || typeof text !== "string") return [];
  const thinkParsed = parseThinkContent(text, thinkStartTag, thinkEndTag);
  const targetText = thinkParsed.mainText;
  if (!targetText) return [];

  const results: StepGuideData[] = [];
  const regex = new RegExp(STEP_GUIDE_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(targetText)) !== null) {
    try {
      const blockContent = match[1];
      const lines = blockContent.split("\n");
      const steps: string[] = [];

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith("---") || line.startsWith("```")) continue;

        // Match "1: text", "1. text", "1) text", "Step 1: text", etc.
        const numMatch = line.match(/^(?:(?:step\s+)?\d+[:.)]\s*)+([\s\S]+)$/i);
        if (numMatch) {
          const stepText = numMatch[1].trim();
          if (stepText) {
            steps.push(stepText);
          }
        } else if (steps.length > 0) {
          // Append continuation line
          steps[steps.length - 1] += ` ${line}`;
        }
      }

      if (steps.length >= 3 && steps.length <= 20) {
        results.push({ steps });
      } else if (steps.length >= 1) {
        // Fallback if slightly fewer than 3 or more than 20
        results.push({ steps });
      }
    } catch {
      continue;
    }
  }

  return results;
}

/**
 * Strip step-by-step guide block syntax from text to display clean markdown.
 */
export function stripStepGuideCommands(text: string): string {
  if (!text) return "";
  return text
    .replace(/(?:^|\n)(?:```[a-z]*\s*\n)?\s*-{3,}\s*\n\s*\|Step-by-step guide\|\s*\n[\s\S]*?(?:\n\s*-{3,}|\n\s*```|$)/gi, "\n")
    .trim();
}

export const StepGuideCard: React.FC<StepGuideCardProps> = ({ steps, initialStep = 0 }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(
    Math.min(Math.max(0, initialStep), Math.max(0, steps.length - 1))
  );

  if (!steps || steps.length === 0) return null;

  const currentStep = steps[currentStepIndex] || "";
  const totalSteps = steps.length;

  return (
    <div className="w-full my-3 border border-black dark:border-white bg-white dark:bg-black font-sans rounded-none overflow-hidden select-none">
      {/* Current Step Content Area */}
      <div className="p-4 sm:p-5 min-h-[76px] flex items-center justify-center text-center bg-white dark:bg-black text-black dark:text-white border-b border-black/20 dark:border-white/20">
        <div className="w-full text-sm sm:text-base leading-relaxed font-sans font-medium">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              p: ({ children }) => <span className="inline-block"><RandomFontText>{children}</RandomFontText></span>,
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
            {formatMathInText(currentStep)}
          </ReactMarkdown>
        </div>
      </div>

      {/* Navigation & Step Counter Bar: "<        1/3        >" */}
      <div className="flex items-center justify-between px-3 py-2 bg-white dark:bg-black text-xs font-mono">
        <button
          type="button"
          onClick={() => setCurrentStepIndex((prev) => Math.max(0, prev - 1))}
          disabled={currentStepIndex === 0}
          className="px-3 py-1 border border-black/30 dark:border-white/30 bg-white dark:bg-black text-black dark:text-white font-bold disabled:opacity-25 disabled:cursor-not-allowed hover:enabled:bg-black hover:enabled:text-white dark:hover:enabled:bg-white dark:hover:enabled:text-black transition-colors"
          aria-label="Previous step"
        >
          {"<"}
        </button>

        <div className="font-mono text-xs tracking-widest font-bold text-black dark:text-white">
          {currentStepIndex + 1}/{totalSteps}
        </div>

        <button
          type="button"
          onClick={() => setCurrentStepIndex((prev) => Math.min(totalSteps - 1, prev + 1))}
          disabled={currentStepIndex === totalSteps - 1}
          className="px-3 py-1 border border-black/30 dark:border-white/30 bg-white dark:bg-black text-black dark:text-white font-bold disabled:opacity-25 disabled:cursor-not-allowed hover:enabled:bg-black hover:enabled:text-white dark:hover:enabled:bg-white dark:hover:enabled:text-black transition-colors"
          aria-label="Next step"
        >
          {">"}
        </button>
      </div>
    </div>
  );
};
