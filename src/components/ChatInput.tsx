import React, { useRef, useEffect, useMemo } from "react";
import { AttachedFile } from "../types";
import { RandomFontText } from "../utils/randomFont";
import { isBinaryFile } from "../utils/fileCommands";

interface Props {
  onSendMessage: (text: string, attachment?: AttachedFile) => void;
  isLoading: boolean;
  onStop?: () => void;
  showScrollButton?: boolean;
  onScrollToBottom?: () => void;
  // Controlled from the parent (App.tsx) rather than local useState. There
  // are two <ChatInput> render sites (bottom-of-page vs. split view next to
  // an open artifact/file panel) and only one is mounted at a time — React
  // unmounts one and mounts the other whenever that panel opens or closes.
  // Local state would reset to "" on every such swap, silently discarding
  // whatever the person had just typed the instant they opened a panel.
  // Keeping the value in the parent means it survives the remount.
  text: string;
  onTextChange: (text: string) => void;
  attachment: AttachedFile | undefined;
  onAttachmentChange: (attachment: AttachedFile | undefined) => void;
  errorMessage: string | null;
  onErrorMessageChange: (msg: string | null) => void;
}

export const ChatInput: React.FC<Props> = ({
  onSendMessage,
  isLoading,
  onStop,
  showScrollButton,
  onScrollToBottom,
  text,
  onTextChange,
  attachment,
  onAttachmentChange,
  errorMessage,
  onErrorMessageChange,
}) => {
  const setText = onTextChange;
  const setAttachment = onAttachmentChange;
  const setErrorMessage = onErrorMessageChange;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const placeholderText = useMemo(() => {
    const verbs = ["Type", "Write"];
    const articles = ["your", "a"];
    const verb = verbs[Math.floor(Math.random() * verbs.length)];
    const article = articles[Math.floor(Math.random() * articles.length)];
    return `${verb} ${article} message...`;
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        140
      )}px`;
    }
  }, [text]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        let result = reader.result as string;
        if (result && !result.startsWith("data:image")) {
          const mime = file.type || "image/jpeg";
          result = `data:${mime};base64,${result}`;
        }
        resolve(result);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const fileToText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsText(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name);

    if (isImage) {
      try {
        const dataUrl = await fileToBase64(file);
        setAttachment({
          name: file.name,
          type: "image",
          mimeType: file.type || "image/png",
          size: file.size,
          dataUrl,
        });
      } catch {
        setErrorMessage("[READ_ERROR] Could not read image file.");
      }
    } else {
      try {
        if (isBinaryFile(file.name)) {
          const dataUrl = await fileToBase64(file);
          let base64Data = dataUrl;
          if (base64Data.includes(",")) base64Data = base64Data.split(",")[1];
          setAttachment({
            name: file.name,
            type: "binary",
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            textContent: base64Data,
          });
        } else {
          let textContent = "";
          try {
            textContent = await fileToText(file);
          } catch {
            textContent = await fileToBase64(file);
          }

          setAttachment({
            name: file.name,
            type: "text",
            mimeType: file.type || "text/plain",
            size: file.size,
            textContent,
          });
        }
      } catch {
        setErrorMessage("[READ_ERROR] Could not read file content.");
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveAttachment = () => {
    setAttachment(undefined);
    setErrorMessage(null);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!text.trim() && !attachment) || isLoading) return;

    onSendMessage(text, attachment);
    setText("");
    setAttachment(undefined);
    setErrorMessage(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(2)} KB`;
  };

  return (
    <div className="relative border-t-2 border-black dark:border-white bg-white text-black dark:bg-black dark:text-white p-2 sm:p-3 font-mono sticky bottom-0 z-20">
      {showScrollButton && onScrollToBottom && (
        <div className="absolute right-4 sm:right-8 -top-10 z-30">
          <button
            type="button"
            onClick={onScrollToBottom}
            title="Scroll to bottom"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white shadow-md hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all duration-150 text-xs font-bold uppercase tracking-wider"
          >
            <span>↓</span>
            <RandomFontText text="[BOTTOM]" />
          </button>
        </div>
      )}
      <div className="w-full max-w-6xl mx-auto space-y-2">
        {/* Error message banner */}
        {errorMessage && (
          <div className="p-2 border border-dashed border-black dark:border-white bg-white dark:bg-black text-xs flex items-center justify-between">
            <span className="font-bold"><RandomFontText text={errorMessage} /></span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="px-1 border border-black dark:border-white text-[10px] uppercase font-bold"
            >
              <RandomFontText text="[CLEAR]" />
            </button>
          </div>
        )}

        {/* Attached File Preview */}
        {attachment && (
          <div className="p-2 border border-black dark:border-white bg-white dark:bg-black flex items-center justify-between text-xs">
            <div className="flex items-center space-x-3 overflow-hidden">
              {attachment.type === "image" && attachment.dataUrl ? (
                <img
                  src={attachment.dataUrl}
                  alt={attachment.name}
                  className="w-10 h-10 object-cover border border-black dark:border-white"
                />
              ) : (
                <div className="w-10 h-10 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black flex items-center justify-center font-bold text-[10px]">
                  <RandomFontText text="[TXT]" />
                </div>
              )}
              <div className="truncate">
                <div className="font-bold truncate"><RandomFontText text={attachment.name} /></div>
                <div className="text-[10px] opacity-70">
                  <RandomFontText text={`${attachment.type.toUpperCase()} | ${formatSize(attachment.size)}`} />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRemoveAttachment}
              className="ml-2 px-2 py-1 border border-black dark:border-white font-bold uppercase hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[11px]"
            >
              <RandomFontText text="[REMOVE_FILE]" />
            </button>
          </div>
        )}

        {/* Form Input */}
        <form onSubmit={handleSubmit} className="flex flex-col space-y-1.5 sm:space-y-2">
          <div className="border-2 border-black dark:border-white bg-transparent font-mono p-2 sm:p-2.5 min-h-[44px] focus-within:ring-1 focus-within:ring-black dark:focus-within:ring-white">
            <textarea
              ref={textareaRef}
              value={text}
              placeholder={placeholderText}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isLoading}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
              autoComplete="off"
              className="w-full h-full bg-transparent text-black dark:text-white caret-black dark:caret-white font-mono text-sm sm:text-base focus:outline-none resize-y leading-relaxed disabled:opacity-50 placeholder:opacity-50 overflow-y-auto"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2">
              {/* File input button */}
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                accept="*"
                className="hidden"
                id="file-attachment-input"
              />
              <label
                htmlFor="file-attachment-input"
                className="cursor-pointer px-2.5 py-1 sm:px-3 sm:py-1.5 border border-black dark:border-white font-bold uppercase hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors inline-block text-[11px] sm:text-xs"
              >
                <RandomFontText text="+ [ATTACH_FILE]" />
              </label>
            </div>

            <div className="flex items-center space-x-2 ml-auto">
              {(text.trim() || attachment) && (
                <button
                  type="button"
                  onClick={() => {
                    setText("");
                    setAttachment(undefined);
                    setErrorMessage(null);
                  }}
                  className="px-2 py-1 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[11px] uppercase font-bold transition-colors"
                >
                  <RandomFontText text="[CLEAR]" />
                </button>
              )}

              {isLoading ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="px-5 sm:px-6 py-1.5 sm:py-2 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black font-bold uppercase tracking-wider text-xs hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-colors"
                >
                  <RandomFontText text="[STOP]" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!text.trim() && !attachment}
                  className="px-5 sm:px-6 py-1.5 sm:py-2 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black font-bold uppercase tracking-wider text-xs hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white disabled:opacity-40 transition-colors"
                >
                  <RandomFontText text="[SEND]" />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
