import React, { useState, useEffect, useRef } from "react";
import { VirtualFile } from "../types";
import { getFileCategory, downloadSingleFile, unescapeFileContent } from "../utils/fileCommands";
import { RandomFontText } from "../utils/randomFont";
import { Eye, Code as CodeIcon, Copy, Check, Download, Maximize2, Minimize2, X, RotateCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { formatMathInText } from "../utils/mathHelper";
import mermaid from "mermaid";

const MermaidPreview = ({ content }: { content: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: 'default' });
    let isMounted = true;
    
    const renderDiagram = async () => {
      try {
        if (containerRef.current) {
          const id = `mermaid-${Date.now()}`;
          const { svg } = await mermaid.render(id, content);
          if (isMounted && containerRef.current) {
            containerRef.current.innerHTML = svg;
          }
        }
      } catch (e: any) {
        if (isMounted && containerRef.current) {
          containerRef.current.innerHTML = `<div class="border border-black dark:border-white font-bold p-4 text-xs font-mono">Error parsing mermaid diagram:<br/>${e.message}</div>`;
        }
      }
    };
    
    renderDiagram();
    
    return () => { isMounted = false; };
  }, [content]);

  return <div className="w-full h-full flex justify-center items-center overflow-auto bg-white p-4" ref={containerRef} />;
};

interface Props {
  file: VirtualFile | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
}

export const ArtifactPanel: React.FC<Props> = ({
  file,
  isExpanded,
  onToggleExpand,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  if (!file) return null;

  const isHtml = file.language === "html" || file.path.endsWith(".html") || file.path.endsWith(".htm");
  const isMarkdown = file.language === "markdown" || file.path.endsWith(".md");
  const isSvg = file.language === "svg" || file.path.endsWith(".svg");
  const isMermaid = file.language === "mermaid" || file.path.endsWith(".mermaid") || file.path.endsWith(".mmd");
  const isPdf = file.path.endsWith(".pdf");

  const canPreview = isHtml || isMarkdown || isSvg || isMermaid || isPdf;
  // If cannot preview, default to code view
  const currentTab = canPreview ? activeTab : "code";

  // Non-HTML files over 70 MB are not rendered: show a notice and let the user open the file's folder instead.
  const LARGE_VIEW_BYTES = 70 * 1024 * 1024;
  if (!isHtml && (file.size || 0) > LARGE_VIEW_BYTES) {
    return (
      <div className="flex flex-col h-full w-full bg-white dark:bg-black text-black dark:text-white border-l border-black dark:border-white font-mono select-none overflow-hidden">
        <div className="flex items-center justify-between p-2 sm:px-3 border-b border-black dark:border-white flex-shrink-0">
          <div className="min-w-0 truncate text-xs font-bold uppercase tracking-wider pl-1">
            <RandomFontText text={`${file.name} · ${getFileCategory(file.path)}`} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 border border-black dark:border-white font-bold uppercase text-xs hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
            title="Close Panel"
          >
            <RandomFontText text="[CLOSE]" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="font-bold uppercase tracking-wider text-sm">File too large</div>
          <button
            type="button"
            onClick={() => fetch("/api/workspace/reveal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: file.path }) }).catch(() => {})}
            className="px-3 py-1.5 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black font-bold uppercase text-xs hover:opacity-80"
          >
            [OPEN FOLDER]
          </button>
        </div>
      </div>
    );
  }

  const cleanContent = unescapeFileContent(file.content);

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReloadPreview = () => {
    setIframeKey((prev) => prev + 1);
  };

  const codeLines = cleanContent.split("\n");

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-black text-black dark:text-white border-l border-black dark:border-white font-mono select-none overflow-hidden">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between p-2 sm:px-3 border-b border-black dark:border-white bg-white dark:bg-black flex-shrink-0">
        {/* Left: Tab Switchers & File title */}
        <div className="flex items-center gap-2 min-w-0">
          {canPreview && (
            <div className="flex border border-black dark:border-white flex-shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={`px-2.5 py-1 text-xs font-bold uppercase transition-colors flex items-center gap-1.5 ${
                  currentTab === "preview"
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "hover:bg-white dark:hover:bg-black"
                }`}
                title="Preview"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">PREVIEW</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("code")}
                className={`px-2.5 py-1 text-xs font-bold uppercase transition-colors flex items-center gap-1.5 border-l border-black dark:border-white ${
                  currentTab === "code"
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "hover:bg-white dark:hover:bg-black"
                }`}
                title="View Code"
              >
                <CodeIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">CODE</span>
              </button>
            </div>
          )}

          <div className="min-w-0 truncate text-xs font-bold uppercase tracking-wider pl-1">
            <RandomFontText text={`${file.name} · ${getFileCategory(file.path)}`} />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {currentTab === "preview" && isHtml && (
            <button
              type="button"
              onClick={handleReloadPreview}
              className="p-1.5 border border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black active:translate-y-0.5 transition-colors"
              title="Reload Preview"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="px-2 py-1 border border-black dark:border-white font-mono text-xs uppercase hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black active:translate-y-0.5 transition-colors"
            title="Copy Content"
          >
            <RandomFontText text={copied ? "[COPIED]" : "[COPY]"} />
          </button>

          <button
            type="button"
            onClick={() => downloadSingleFile(file)}
            className="p-1.5 border border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black active:translate-y-0.5 transition-colors"
            title="Download File"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onToggleExpand}
            className="p-1.5 border border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black active:translate-y-0.5 transition-colors hidden md:inline-flex"
            title={isExpanded ? "Restore Half Screen" : "Expand Full Screen"}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold uppercase text-xs transition-colors"
            title="Close Panel"
          >
            <RandomFontText text="[CLOSE]" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 w-full h-full overflow-hidden relative">
        {currentTab === "preview" ? (
          <div className="w-full h-full overflow-auto">
            {isHtml ? (
              <iframe
                key={iframeKey}
                title={file.name}
                srcDoc={file.content}
                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
                className="w-full h-full border-0 bg-white"
              />
            ) : isMarkdown ? (
              <div className="p-4 sm:p-6 select-text overflow-y-auto max-w-4xl mx-auto leading-relaxed">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    h1: ({ ...props }) => <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-wider mt-6 mb-3 border-b-2 border-black dark:border-white pb-2" {...props} />,
                    h2: ({ ...props }) => <h2 className="text-lg sm:text-xl font-bold uppercase tracking-wider mt-5 mb-2.5 border-b border-black/30 dark:border-white/30 pb-1" {...props} />,
                    h3: ({ ...props }) => <h3 className="text-base sm:text-lg font-bold uppercase tracking-wider mt-4 mb-2" {...props} />,
                    h4: ({ ...props }) => <h4 className="text-sm sm:text-base font-bold uppercase tracking-wider mt-3 mb-1.5" {...props} />,
                    h5: ({ ...props }) => <h5 className="text-xs sm:text-sm font-bold uppercase tracking-wider mt-2 mb-1" {...props} />,
                    h6: ({ ...props }) => <h6 className="text-xs font-bold uppercase tracking-wider mt-2 mb-1 opacity-80" {...props} />,
                    p: ({ ...props }) => <p className="mb-3.5 leading-relaxed text-sm" {...props} />,
                    hr: ({ ...props }) => <hr className="my-6 border-t-2 border-black dark:border-white" {...props} />,
                    blockquote: ({ ...props }) => <blockquote className="border-l-4 border-black dark:border-white pl-4 py-1.5 my-3 bg-black/5 dark:bg-white/5 italic text-sm" {...props} />,
                    ul: ({ ...props }) => <ul className="list-disc pl-5 mb-3.5 space-y-1 text-sm" {...props} />,
                    ol: ({ ...props }) => <ol className="list-decimal pl-5 mb-3.5 space-y-1 text-sm" {...props} />,
                    li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
                    table: ({ ...props }) => (
                      <div className="overflow-x-auto my-4 border border-black dark:border-white">
                        <table className="w-full text-left border-collapse text-xs sm:text-sm font-mono" {...props} />
                      </div>
                    ),
                    thead: ({ ...props }) => <thead className="bg-black/10 dark:bg-white/10 border-b border-black dark:border-white font-bold uppercase" {...props} />,
                    tbody: ({ ...props }) => <tbody className="divide-y divide-black/10 dark:divide-white/10" {...props} />,
                    tr: ({ ...props }) => <tr className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors" {...props} />,
                    th: ({ ...props }) => <th className="p-2.5 font-bold uppercase tracking-wider border-r border-black/20 dark:border-white/20 last:border-r-0" {...props} />,
                    td: ({ ...props }) => <td className="p-2.5 border-r border-black/10 dark:border-white/10 last:border-r-0" {...props} />,
                    strong: ({ ...props }) => <strong className="font-bold text-black dark:text-white" {...props} />,
                    em: ({ ...props }) => <em className="italic" {...props} />,
                    del: ({ ...props }) => <del className="line-through opacity-60" {...props} />,
                    a: ({ ...props }) => <a className="underline font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors px-0.5" target="_blank" rel="noreferrer" {...props} />,
                    input: ({ type, ...props }: any) => (
                      type === "checkbox" ? (
                        <input type="checkbox" className="mr-2 accent-black dark:accent-white" readOnly {...props} />
                      ) : (
                        <input type={type} {...props} />
                      )
                    ),
                    code: ({ inline, children, ...props }: { inline?: boolean; children?: React.ReactNode }) => {
                      if (inline) {
                        return <code className="px-1 py-0.5 border border-black/30 dark:border-white/30 bg-black/5 dark:bg-white/5 text-xs font-mono font-bold" {...props}>{children}</code>;
                      }
                      return (
                        <pre className="p-3 my-3 border border-black dark:border-white bg-black/5 dark:bg-white/5 overflow-x-auto text-xs font-mono leading-relaxed">
                          <code>{children}</code>
                        </pre>
                      );
                    },
                  }}
                >
                  {formatMathInText(unescapeFileContent(file.content))}
                </ReactMarkdown>
              </div>
            ) : isSvg ? (
              <div
                className="w-full h-full flex items-center justify-center p-6 bg-white dark:bg-black"
                dangerouslySetInnerHTML={{ __html: file.content }}
              />
            ) : isMermaid ? (
              <MermaidPreview content={file.content} />
            ) : isPdf ? (
              <iframe
                title={file.name}
                src={file.content.startsWith('JVBERi0') ? `data:application/pdf;base64,${file.content}` : URL.createObjectURL(new Blob([file.content], { type: 'application/pdf' }))}
                className="w-full h-full border-0 bg-white"
              />
            ) : null}
          </div>
        ) : (
          /* Code View */
          <div className="w-full h-full overflow-auto select-text bg-white dark:bg-black font-mono text-xs leading-relaxed">
            <div className="min-w-full inline-block">
              {codeLines.map((line, index) => (
                <div
                  key={index}
                  className="flex hover:bg-black/5 dark:hover:bg-white/5 py-0.5 group"
                >
                  <div className="w-12 flex-shrink-0 text-right pr-3 select-none opacity-40 font-mono text-[11px] group-hover:opacity-80">
                    {index + 1}
                  </div>
                  <pre className="flex-1 overflow-x-visible whitespace-pre font-mono pr-4">
                    <code>{line || "\n"}</code>
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
