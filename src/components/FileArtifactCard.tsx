import React from "react";
import { VirtualFile } from "../types";
import { getFileCategory, downloadSingleFile, downloadAllFiles } from "../utils/fileCommands";
import { RandomFontText } from "../utils/randomFont";
import { Globe, Code, FileText, Download, Image, Layout } from "lucide-react";

interface Props {
  files: VirtualFile[];
  onOpenArtifact: (file: VirtualFile) => void;
}

export const FileArtifactCard: React.FC<Props> = ({ files, onOpenArtifact }) => {
  if (!files || files.length === 0) return null;

  const getIcon = (language: string) => {
    switch (language) {
      case "html":
        return <Globe className="w-5 h-5" />;
      case "markdown":
      case "text":
        return <FileText className="w-5 h-5" />;
      case "svg":
        return <Image className="w-5 h-5" />;
      case "mermaid":
        return <Layout className="w-5 h-5" />;
      case "pdf":
        return <FileText className="w-5 h-5" />;
      default:
        return <Code className="w-5 h-5" />;
    }
  };

  return (
    <div className="mt-4 pt-3 border-t border-black/20 dark:border-white/20">
      <div className="font-mono text-[11px] uppercase tracking-wider opacity-70 mb-2.5">
        <RandomFontText text={`[CREATED_OR_MODIFIED_FILES (${files.length})]:`} />
      </div>

      <div className="space-y-2">
        {files.map((file) => {
          const category = getFileCategory(file.path);
          return (
            <div
              key={file.path}
              onClick={() => onOpenArtifact(file)}
              className="p-3 border border-black dark:border-white bg-white dark:bg-black hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center min-w-0 pr-2">
                <div className="w-9 h-9 flex-shrink-0 border border-black dark:border-white flex items-center justify-center mr-3 bg-white dark:bg-black text-black dark:text-white">
                  {getIcon(file.language)}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-xs truncate uppercase tracking-wider font-mono text-black dark:text-white">
                    <RandomFontText text={file.name || file.path} />
                  </div>
                  <div className="text-[11px] opacity-70 font-mono text-black dark:text-white">
                    <RandomFontText text={category} />
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0 ml-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadSingleFile(file);
                  }}
                  className="px-2.5 py-1 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-mono text-[10px] uppercase font-bold active:translate-y-0.5 transition-all flex items-center gap-1.5"
                  title={`Download ${file.name}`}
                >
                  <Download className="w-3 h-3" />
                  <RandomFontText text="DOWNLOAD" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {files.length > 1 && (
        <div className="mt-2.5 flex justify-end">
          <button
            type="button"
            onClick={() => downloadAllFiles(files)}
            className="px-3 py-1.5 border border-black dark:border-white font-mono text-xs uppercase font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black active:translate-y-0.5 transition-colors flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            <RandomFontText text="DOWNLOAD ALL" />
          </button>
        </div>
      )}
    </div>
  );
};
