import React from "react";
import { ApiConfig } from "../types";
import { RandomFontText } from "../utils/randomFont";

interface Props {
  config: ApiConfig;
  onOpenSettings: () => void;
  onOpenSetupGuide: () => void;
  onToggleSidebar: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  isSidebarOpen: boolean;
  filesCount?: number;
  onToggleArtifactPanel?: () => void;
  workspaceName?: string;
  workspacePath?: string;
  onOpenWorkspace?: () => void;
}

export const Header: React.FC<Props> = ({
  config,
  onOpenSettings,
  onOpenSetupGuide,
  onToggleSidebar,
  isDarkMode,
  onToggleTheme,
  isSidebarOpen,
  filesCount = 0,
  onToggleArtifactPanel,
  workspaceName,
  workspacePath,
  onOpenWorkspace,
}) => {
  // Truncate long URL for header display
  const shortUrl = config.apiUrl
    .replace(/^https?:\/\//, "")
    .replace(/\/v1\/chat\/completions$/, "");

  return (
    <header className="w-full border-b-2 border-black dark:border-white bg-white text-black dark:bg-black dark:text-white px-3 sm:px-4 py-2 sm:py-3 font-mono sticky top-0 z-30 select-none">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        {/* Top Header Row on Mobile / Left Section on Desktop */}
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div className="flex items-center space-x-2 sm:space-x-3 truncate">
            <button
              onClick={onToggleSidebar}
              className="px-2 py-1 border border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold text-xs uppercase shrink-0"
            >
              <RandomFontText text={isSidebarOpen ? "[HIDE_HIST]" : "[HISTORY]"} />
            </button>

            <div className="truncate">
              <h1 className="text-sm sm:text-base md:text-lg font-bold tracking-wider uppercase whitespace-nowrap truncate">
                <RandomFontText text="fanluc" seedOffset={10} />
              </h1>
            </div>
          </div>

          {/* Theme toggle for mobile */}
          <button
            onClick={onToggleTheme}
            className="sm:hidden px-2 py-1 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold uppercase text-xs shrink-0 transition-colors"
          >
            <RandomFontText text={isDarkMode ? "[LT]" : "[DK]"} />
          </button>
        </div>

        {/* Buttons section */}
        <div className="flex items-center justify-between sm:justify-end space-x-1.5 sm:space-x-3 text-xs w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-black/10 dark:border-white/10">
          {onOpenWorkspace && (
            <button
              onClick={onOpenWorkspace}
              className="flex-1 sm:flex-initial max-w-[11rem] truncate px-2 sm:px-3 py-1 sm:py-1.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold transition-colors"
              title={workspacePath ? `Workspace: ${workspacePath}` : "Choose workspace folder"}
            >
              <RandomFontText text={`[DIR: ${workspaceName || "choose"}]`} seedOffset={12} />
            </button>
          )}

          {onToggleArtifactPanel && (
            <button
              onClick={onToggleArtifactPanel}
              className="flex-1 sm:flex-initial px-2 sm:px-3 py-1 sm:py-1.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold uppercase text-[10px] sm:text-[11px] whitespace-nowrap text-center transition-colors"
              title="Toggle File Workspace / Artifacts"
            >
              <RandomFontText text={filesCount > 0 ? `[FILES (${filesCount})]` : "[FILES]"} seedOffset={15} />
            </button>
          )}

          <button
            onClick={onOpenSetupGuide}
            className="flex-1 sm:flex-initial px-2 sm:px-3 py-1 sm:py-1.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold uppercase text-[10px] sm:text-[11px] whitespace-nowrap text-center transition-colors"
          >
            <RandomFontText text="[SETUP_GUIDE]" seedOffset={20} />
          </button>

          <button
            onClick={onOpenSettings}
            className="flex-1 sm:flex-initial px-2 sm:px-3 py-1 sm:py-1.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold uppercase transition-colors text-[10px] sm:text-xs whitespace-nowrap text-center"
          >
            <RandomFontText text="[SETTINGS]" seedOffset={30} />
          </button>

          <button
            onClick={onToggleTheme}
            className="hidden sm:block px-2 sm:px-3 py-1 sm:py-1.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold uppercase text-[11px] whitespace-nowrap transition-colors"
          >
            <RandomFontText text={isDarkMode ? "[LT]" : "[DK]"} seedOffset={40} />
          </button>
        </div>
      </div>
    </header>
  );
};

