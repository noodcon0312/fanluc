import React, { useState } from "react";
import { Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { RandomFontText } from "../utils/randomFont";

interface Props {
  urls: string[];
}

function getDomain(urlStr: string): string {
  try {
    const parsed = new URL(urlStr.startsWith("http") ? urlStr : `https://${urlStr}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return urlStr.replace(/^https?:\/\//, "").split("/")[0] || urlStr;
  }
}

export const SourcesList: React.FC<Props> = ({ urls }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const uniqueUrls = React.useMemo(() => {
    return Array.from(new Set(urls.map((u) => u.trim()))).filter(Boolean);
  }, [urls]);

  if (uniqueUrls.length === 0) return null;

  const handleCopy = (url: string, index: number) => {
    navigator.clipboard.writeText(url);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="mt-3 pt-2 border-t border-black/20 dark:border-white/20 font-mono text-xs">
      {/* Sources Toggle Button */}
      <div className="flex items-center">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-2 px-2.5 py-1.5 border border-black dark:border-white bg-white text-black hover:bg-black hover:text-white dark:bg-black dark:text-white dark:hover:bg-white dark:hover:text-black transition-colors rounded-none"
          title="View fetched web sources"
        >
          <span className="font-bold uppercase tracking-wider text-[11px]">
            <RandomFontText text={`[SOURCES: ${uniqueUrls.length}]`} />
          </span>

          {/* Favicons Stack */}
          <div className="flex items-center space-x-1">
            {uniqueUrls.slice(0, 4).map((url, idx) => {
              const domain = getDomain(url);
              const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
              return (
                <img
                  key={idx}
                  src={faviconUrl}
                  alt=""
                  className="w-3.5 h-3.5 object-contain flex-shrink-0"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = "none";
                  }}
                />
              );
            })}
          </div>

          {isOpen ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
        </button>
      </div>

      {/* Expanded Sources Panel */}
      {isOpen && (
        <div className="mt-2 p-3 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white rounded-none space-y-2.5">
          <div className="flex items-center justify-between pb-1.5 border-b border-black/20 dark:border-white/20 text-[11px] font-bold uppercase tracking-wider opacity-80">
            <span>
              <RandomFontText text="FETCHED WEB SOURCES" />
            </span>
            <span>
              <RandomFontText text={`${uniqueUrls.length} URL${uniqueUrls.length > 1 ? "S" : ""}`} />
            </span>
          </div>

          <div className="divide-y divide-black/10 dark:divide-white/10 max-h-72 overflow-y-auto">
            {uniqueUrls.map((url, index) => {
              const domain = getDomain(url);
              const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
              const isCopied = copiedIndex === index;

              return (
                <div key={index} className="py-2 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <img
                      src={faviconUrl}
                      alt=""
                      className="w-3.5 h-3.5 object-contain flex-shrink-0 mt-0.5"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = "none";
                      }}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs truncate">
                        <RandomFontText text={domain} />
                      </div>
                      {domain.endsWith(".docs") ? (
                        <span className="text-[11px] opacity-80 break-all block font-sans leading-tight mt-0.5">{url} (built-in docs)</span>
                      ) : (
                      <a
                        href={url.startsWith("http") ? url : `https://${url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] opacity-80 hover:opacity-100 hover:underline break-all block text-black dark:text-white font-sans leading-tight mt-0.5"
                      >
                        {url}
                      </a>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0 font-mono text-[10px]">
                    <button
                      onClick={() => handleCopy(url, index)}
                      className="px-2.5 py-1 border border-black dark:border-white bg-white text-black hover:bg-black hover:text-white dark:bg-black dark:text-white dark:hover:bg-white dark:hover:text-black uppercase font-bold flex items-center gap-1 transition-colors rounded-none"
                      title="Copy URL"
                    >
                      {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>
                        <RandomFontText text={isCopied ? "[COPIED]" : "[COPY]"} />
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
