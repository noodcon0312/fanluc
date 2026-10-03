import React from "react";

export interface ImageSearchCardProps {
  images: { title: string; src: string; thumb: string; page: string }[];
  query?: string;
  onImageClick?: (img: { src: string; page: string }) => void;
}

export const ImageSearchCard: React.FC<ImageSearchCardProps> = ({ images, query, onImageClick }) => {
  if (!images || images.length === 0) return null;
  return (
    <div className="my-3 border-2 border-black dark:border-white bg-white dark:bg-black font-mono">
      <div className="px-3 py-2 border-b-2 border-black dark:border-white flex items-center justify-between bg-black text-white dark:bg-white dark:text-black">
        <span className="text-xs font-bold uppercase tracking-wider">
          [IMAGE_SEARCH] {query ? `" ${query} " — ${images.length} images` : `${images.length} images`}
        </span>
        <span className="text-[10px] opacity-70">SearXNG · images</span>
      </div>
      <div className="p-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {images.slice(0, 6).map((img, idx) => (
          <a
            key={idx}
            href={img.page || img.src}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (onImageClick) {
                e.preventDefault();
                onImageClick(img);
              }
            }}
            className="group border border-black/20 dark:border-white/20 overflow-hidden hover:border-black dark:hover:border-white transition-colors block"
            title={img.title}
          >
            <div className="aspect-square bg-black/5 dark:bg-white/5 overflow-hidden relative">
              <img
                src={img.thumb || img.src}
                alt={img.title}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                onError={(e) => {
                  // Hide broken images (hotlink blocked etc.) — also try proxy
                  const target = e.target as HTMLImageElement;
                  if (target.dataset.proxied === "1") {
                    target.style.display = "none";
                    const parent = target.parentElement;
                    if (parent) parent.classList.add("hidden");
                  } else {
                    target.dataset.proxied = "1";
                    // Try proxy via server
                    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(img.src)}`;
                    target.src = proxyUrl;
                  }
                }}
              />
            </div>
            <div className="px-1.5 py-1 text-[10px] leading-tight truncate opacity-80" title={img.title}>
              {img.title || "Image"}
            </div>
          </a>
        ))}
      </div>
      <div className="px-2 py-1 border-t border-black/10 dark:border-white/10 text-[10px] opacity-60 flex items-center justify-between">
        <span>Click thumb → open img_src, click title → page</span>
        <span className="hidden sm:inline">Tip: image_search(query="...") in chat</span>
      </div>
    </div>
  );
};

export function extractImageCardsFromText(text: string): { query: string; count: number }[] {
  // For CommandLog etc. — not needed
  return [];
}

export function stripImageSearchForDisplay(text: string): string {
  return text;
}
