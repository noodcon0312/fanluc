import React, { useRef, useState } from "react";
import { VirtualFile } from "../types";
import { Download, Upload, Trash2, File, X, FileText, Code, Globe, Image, Layout, Folder, CornerLeftUp } from "lucide-react";
import { downloadSingleFile, downloadAllFiles, getFileCategory, getFileLanguage, deleteFileFromWorkspace, isBinaryFile, normalizeFilePath } from "../utils/fileCommands";
import { RandomFontText } from "../utils/randomFont";

interface Props {
  files: Record<string, VirtualFile>;
  onSelect: (path: string) => void;
  onClose: () => void;
  onRefreshFiles?: () => void;
}

export const FileListPanel: React.FC<Props> = ({ files, onSelect, onClose, onRefreshFiles }) => {
  const fileKeys = Object.keys(files);
  // Folder navigation: `dir` is the folder being viewed ("" = workspace root)
  const [dir, setDir] = useState("");
  const prefix = dir ? dir + "/" : "";
  const folderCounts = new Map<string, number>();
  const hereKeys: string[] = [];
  for (const k of fileKeys) {
    if (!k.startsWith(prefix)) continue;
    const rest = k.slice(prefix.length);
    const i = rest.indexOf("/");
    if (i < 0) hereKeys.push(k);
    else folderCounts.set(rest.slice(0, i), (folderCounts.get(rest.slice(0, i)) || 0) + 1);
  }
  const folders = [...folderCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  hereKeys.sort((a, b) => a.localeCompare(b));
  const crumbs = dir ? dir.split("/") : [];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadAll = () => {
    downloadAllFiles(Object.values(files));
  };

  const handleDeleteFile = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    await deleteFileFromWorkspace(path);
    if (onRefreshFiles) onRefreshFiles();
  };

  const [, setTick] = useState(0);

  // Upload files straight into the workspace folder on disk (streamed, no size limit)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    for (const file of selected) {
      try {
        const path = normalizeFilePath(file.name);
        const r = await fetch(`/api/workspace/upload-raw?path=${encodeURIComponent(path)}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        });
        if (!r.ok) console.error("Upload failed:", await r.text());
      } catch (err) {
        console.error("Upload error:", err);
      }
    }
    setTick((t) => t + 1);
    if (onRefreshFiles) onRefreshFiles();
  };

  const getIcon = (language: string) => {
    switch (language) {
      case "html": return <Globe className="w-5 h-5" />;
      case "markdown": case "text": return <FileText className="w-5 h-5" />;
      case "svg": return <Image className="w-5 h-5" />;
      case "mermaid": return <Layout className="w-5 h-5" />;
      default: return <Code className="w-5 h-5" />;
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-black text-black dark:text-white border-l border-black dark:border-white font-mono select-none overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-black dark:border-white">
        <h2 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
          <RandomFontText text="WORKSPACE FILES" />
          <span className="text-xs opacity-60">({fileKeys.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="*"
            onChange={handleFileUpload}
            className="hidden"
            id="panel-file-upload-input"
          />
          <label
            htmlFor="panel-file-upload-input"
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-bold uppercase border border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors cursor-pointer"
            title="Upload files"
          >
            <Upload size={14} />
            <span>+ UPLOAD</span>
          </label>

          {fileKeys.length > 0 && (
            <button
              onClick={handleDownloadAll}
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-bold uppercase border border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
              title="Download all files"
            >
              <Download size={14} />
              <span>DOWNLOAD ALL</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="px-2 py-1 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold uppercase text-xs transition-colors"
            aria-label="Close"
          >
            <RandomFontText text="[CLOSE]" />
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      {dir && (
        <div className="flex items-center flex-wrap gap-1 px-4 py-1.5 border-b border-black dark:border-white text-xs">
          <button className="font-bold hover:underline" onClick={() => setDir("")}>root</button>
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              <span className="opacity-50">/</span>
              <button className="font-bold hover:underline" onClick={() => setDir(crumbs.slice(0, i + 1).join("/"))}>{c}</button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white dark:bg-black">
        {dir && (
          <div
            className="p-3 border border-black dark:border-white bg-white dark:bg-black hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer flex items-center gap-3 text-xs font-bold"
            onClick={() => setDir(crumbs.slice(0, -1).join("/"))}
          >
            <CornerLeftUp size={16} /> <span>..</span>
          </div>
        )}
        {folders.map(([name, n]) => (
          <div
            key={"dir:" + name}
            className="p-3 border border-black dark:border-white bg-white dark:bg-black hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-between"
            onClick={() => setDir(prefix + name)}
          >
            <div className="flex items-center min-w-0 pr-2">
              <div className="w-10 h-10 flex-shrink-0 border border-black dark:border-white flex items-center justify-center mr-4">
                <Folder className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs truncate tracking-wider">{name}/</div>
                <div className="text-[11px] opacity-70 mt-0.5">{n} {n === 1 ? "file" : "files"}</div>
              </div>
            </div>
          </div>
        ))}
        {fileKeys.length === 0 || (hereKeys.length === 0 && folders.length === 0) ? (
          <div className="text-center py-10 opacity-50 uppercase tracking-wider text-xs">
            NO FILES AVAILABLE
          </div>
        ) : (
          hereKeys.map((path) => {
            const file = files[path];
            const category = getFileCategory(path);
            return (
              <div
                key={path}
                className="p-3 border border-black dark:border-white bg-white dark:bg-black hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-between"
                onClick={() => onSelect(path)}
              >
                <div className="flex items-center min-w-0 pr-2">
                  <div className="w-10 h-10 flex-shrink-0 border border-black dark:border-white flex items-center justify-center mr-4 bg-white dark:bg-black text-black dark:text-white">
                    {getIcon(file.language)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-xs truncate uppercase tracking-wider text-black dark:text-white">
                      <RandomFontText text={file.name || file.path} />
                    </div>
                    <div className="text-[11px] opacity-70 mt-0.5 text-black dark:text-white">
                      <RandomFontText text={category} />
                    </div>
                  </div>
                </div>
                
                <div className="flex-shrink-0 ml-2 flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadSingleFile(file);
                    }}
                    className="p-2 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                    title="Download file"
                  >
                    <Download size={16} />
                  </button>
                  <button
                    onClick={(e) => handleDeleteFile(e, path)}
                    className="p-2 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                    title="Delete file"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
