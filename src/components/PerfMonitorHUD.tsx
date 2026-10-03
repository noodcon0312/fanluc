import React from "react";
import { ConversationMetrics } from "../utils/tokenCounter";

interface Props {
  metrics: ConversationMetrics;
  onClose: () => void;
  onOpenDevMode: () => void;
  systemPromptType: string;
}

export const PerfMonitorHUD: React.FC<Props> = ({
  metrics,
  onClose,
  onOpenDevMode,
  systemPromptType,
}) => {
  return (
    <div className="w-full border-b-2 border-black dark:border-white bg-black text-white font-mono px-3 py-1.5 text-xs select-none">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <div className="flex items-center space-x-1">
            <span className="opacity-60">TOKENS:</span>
            <span className="font-bold">{metrics.totalTokens.toLocaleString()}</span>
            <span className="opacity-40 text-[9px]">({metrics.promptTokens} in / {metrics.completionTokens} out)</span>
          </div>

          <div className="flex items-center space-x-1 border-l border-white/30 pl-2">
            <span className="opacity-60">SPEED:</span>
            <span className="font-bold">{metrics.avgTokensPerSec > 0 ? `${metrics.avgTokensPerSec} tok/s` : "--"}</span>
          </div>

          <div className="flex items-center space-x-1 border-l border-white/30 pl-2">
            <span className="opacity-60">TOOLCALLS:</span>
            <span className="font-bold">{metrics.totalToolCalls}</span>
          </div>

          <div className="flex items-center space-x-1 border-l border-white/30 pl-2">
            <span className="opacity-60">SYS_PROMPT:</span>
            <span className="font-bold">{metrics.systemInstructionTokens.toLocaleString()} tok</span>
            <span className="opacity-40 text-[9px]">[{systemPromptType}]</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenDevMode}
            className="text-[10px] uppercase font-bold px-1.5 py-0.5 border border-white hover:bg-white hover:text-black transition-colors"
          >
            [DEV_CONSOLE]
          </button>
        </div>
      </div>
    </div>
  );
};
