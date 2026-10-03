import React, { useState } from "react";
import { ChatSession, ApiConfig } from "../types";
import { RandomFontText } from "../utils/randomFont";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession?: (id: string, newTitle: string) => void;
  onClearAll: () => void;
  onExportChat: () => void;
  config: ApiConfig;
  onOpenSettings: () => void;
  onOpenVoiceChat?: () => void;
}

export const Sidebar: React.FC<Props> = ({
  isOpen,
  onClose,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onClearAll,
  onExportChat,
  config,
  onOpenSettings,
  onOpenVoiceChat,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  if (!isOpen) return null;

  const maxReached = sessions.length >= 16;

  const startRenaming = (session: ChatSession) => {
    if (!onRenameSession) return;
    setRenamingId(session.id);
    setRenameValue(session.title || "New Chat");
  };

  const commitRename = () => {
    if (renamingId && onRenameSession) {
      onRenameSession(renamingId, renameValue);
    }
    setRenamingId(null);
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-30 transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 left-0 z-40 w-72 sm:w-80 max-w-[85vw] border-r-2 border-black dark:border-white bg-white text-black dark:bg-black dark:text-white flex flex-col font-mono text-xs shadow-2xl">
        {/* Sidebar Header */}
        <div className="p-4 border-b-2 border-black dark:border-white flex items-center justify-between">
          <span className="font-bold uppercase tracking-wider">
            <RandomFontText text="[CHAT_SESSIONS]" />
          </span>
          <button
            onClick={onClose}
            className="px-2 py-0.5 border border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold"
          >
            <RandomFontText text="[CLOSE]" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="p-3 border-b border-black dark:border-white space-y-2">
          <button
            onClick={onNewSession}
            disabled={maxReached}
            className="w-full py-2 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white font-bold uppercase hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RandomFontText text={`+ [NEW_CHAT] [${sessions.length}/16]`} />
          </button>

          <div className="flex space-x-2">
            <button
              onClick={onExportChat}
              className="w-1/2 py-1.5 border border-black dark:border-white font-bold uppercase text-[11px] hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
            >
              <RandomFontText text="[EXPORT_TXT]" />
            </button>
            <button
              onClick={onClearAll}
              className="w-1/2 py-1.5 border border-black dark:border-white font-bold uppercase text-[11px] hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
            >
              <RandomFontText text="[CLEAR_ALL]" />
            </button>
          </div>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 ? (
            <div className="p-4 text-center opacity-60 italic">
              <RandomFontText text="No chat sessions available." />
            </div>
          ) : (
            sessions.map((session, idx) => {
              const isSelected = session.id === currentSessionId;
              return (
                <div
                  key={session.id}
                  className={`p-2 border transition-colors flex items-center justify-between group ${
                    isSelected
                      ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black font-bold"
                      : "border-black/15 dark:border-white/15 hover:border-black dark:hover:border-white"
                  }`}
                >
                  {renamingId === session.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="flex-1 text-left mr-2 font-mono text-xs bg-transparent border border-current px-1 py-0.5 focus:outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => onSelectSession(session.id)}
                      onDoubleClick={() => startRenaming(session)}
                      title={onRenameSession ? "Double-click to rename" : undefined}
                      className="flex-1 text-left truncate mr-2 font-mono text-xs"
                    >
                      <RandomFontText text={session.title || "New Chat"} seedOffset={idx * 10} />
                    </button>
                  )}

                  {renamingId !== session.id && onRenameSession && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startRenaming(session);
                      }}
                      title="Rename chat"
                      className={`px-1.5 py-0.5 border text-[10px] font-bold uppercase transition-colors mr-1 ${
                        isSelected
                          ? "border-white dark:border-black bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white"
                          : "border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                      }`}
                    >
                      <RandomFontText text="[EDIT]" />
                    </button>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    title="Delete chat session"
                    className={`px-1.5 py-0.5 border text-[10px] font-bold uppercase transition-colors ${
                      isSelected
                        ? "border-white dark:border-black bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white"
                        : "border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                    }`}
                  >
                    <RandomFontText text="[X]" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Voice Chat Footer Button */}
        <div className="p-3 border-t-2 border-black dark:border-white bg-white dark:bg-black">
          <button
            onClick={() => {
              onClose();
              if (onOpenVoiceChat) onOpenVoiceChat();
            }}
            className="w-full py-2.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white font-bold uppercase text-xs hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors flex items-center justify-center gap-2 tracking-wider"
          >
            <RandomFontText text="[VOICE_CHAT_BETA]" seedOffset={15} />
          </button>
        </div>
      </div>
    </>
  );
};
