import React from "react";
import { RandomFontText } from "../utils/randomFont";

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<Props> = ({
  isOpen,
  title,
  message,
  confirmLabel = "[CONFIRM]",
  cancelLabel = "[CANCEL]",
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-none p-4 font-mono select-none"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md border-2 border-black dark:border-white bg-white text-black dark:bg-black dark:text-white p-5 sm:p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-black dark:border-white pb-2">
          <h3 className="font-bold uppercase tracking-wider text-xs sm:text-sm text-black dark:text-white">
            <RandomFontText text={title} />
          </h3>
          <button
            onClick={onCancel}
            className="px-2 py-0.5 border border-black dark:border-white text-xs font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
          >
            <RandomFontText text="[CLOSE]" />
          </button>
        </div>

        <p className="text-xs sm:text-sm leading-relaxed opacity-90">
          <RandomFontText text={message} />
        </p>

        <div className="flex items-center justify-end space-x-3 pt-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white font-bold uppercase text-xs hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
          >
            <RandomFontText text={cancelLabel} />
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black font-bold uppercase text-xs hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-colors"
          >
            <RandomFontText text={confirmLabel} />
          </button>
        </div>
      </div>
    </div>
  );
};
