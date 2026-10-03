import React, { useState, useEffect } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { RandomFontText } from "./randomFont";

/**
 * Parses and extracts a YouTube video ID and returns a safe embed URL.
 * Supports:
 * - https://www.youtube.com/watch?v=ID
 * - https://youtu.be/ID
 * - https://www.youtube.com/shorts/ID
 * - https://www.youtube.com/embed/ID
 * - https://m.youtube.com/watch?v=ID
 */
export function getYouTubeEmbedUrl(url?: string): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();

  // Watch URL: youtube.com/watch?v=...
  const watchMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/watch\?(?:[^&]*&)*v=([a-zA-Z0-9_-]{11})/i
  );
  if (watchMatch) {
    return `https://www.youtube-nocookie.com/embed/${watchMatch[1]}`;
  }

  // Short URL: youtu.be/...
  const shortMatch = trimmed.match(
    /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/i
  );
  if (shortMatch) {
    return `https://www.youtube-nocookie.com/embed/${shortMatch[1]}`;
  }

  // Shorts: youtube.com/shorts/...
  const shortsMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i
  );
  if (shortsMatch) {
    return `https://www.youtube-nocookie.com/embed/${shortsMatch[1]}`;
  }

  // Embed: youtube.com/embed/...
  const embedMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/i
  );
  if (embedMatch) {
    return `https://www.youtube-nocookie.com/embed/${embedMatch[1]}`;
  }

  return null;
}

export interface MediaEmbedProps {
  src?: string;
  alt?: string;
  className?: string;
}

export const MediaEmbed: React.FC<MediaEmbedProps> = ({ src, alt, className = "" }) => {
  if (!src) return null;

  const ytEmbed = getYouTubeEmbedUrl(src);

  if (ytEmbed) {
    return (
      <span className={`block my-3 w-full max-w-2xl mx-auto ${className}`}>
        <span className="block relative w-full pt-[56.25%] border border-black dark:border-white bg-black/5 dark:bg-white/5 overflow-hidden">
          <iframe
            src={ytEmbed}
            title={alt || "YouTube video player"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
          />
        </span>
        {alt && (
          <span className="block mt-1 text-[11px] font-mono opacity-75 italic text-center">
            <RandomFontText text={alt} />
          </span>
        )}
      </span>
    );
  }

  // Check if src is a placeholder or prompt (like "link", "url", or text query)
  const isDirectValidUrl = /^(?:https?:\/\/|data:image\/)/i.test((src || "").trim()) && !/^(?:link|url|image_url|example\.com)/i.test((src || "").trim());
  const initialUrl = isDirectValidUrl 
    ? src 
    : `https://image.pollinations.ai/prompt/${encodeURIComponent(alt || src || "image")}?width=800&height=500&nologo=true`;

  const [currentSrc, setCurrentSrc] = useState<string>(initialUrl);
  const [triedFallback, setTriedFallback] = useState<boolean>(!isDirectValidUrl);
  const [hasError, setHasError] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const isDirect = /^(?:https?:\/\/|data:image\/)/i.test((src || "").trim()) && !/^(?:link|url|image_url|example\.com)/i.test((src || "").trim());
    const target = isDirect 
      ? src 
      : `https://image.pollinations.ai/prompt/${encodeURIComponent(alt || src || "image")}?width=800&height=500&nologo=true`;
    setCurrentSrc(target);
    setTriedFallback(!isDirect);
    setHasError(false);
    setLoading(true);
  }, [src, alt]);

  const handleError = () => {
    if (!triedFallback && (alt || src)) {
      setTriedFallback(true);
      setLoading(true);
      setCurrentSrc(`https://image.pollinations.ai/prompt/${encodeURIComponent(alt || src || "image")}?width=800&height=500&nologo=true`);
    } else {
      setHasError(true);
      setLoading(false);
    }
  };

  if (hasError) {
    return (
      <span className={`block my-3 ${className}`}>
        <span className="flex items-center gap-2 p-3 border border-black/30 dark:border-white/30 bg-white dark:bg-black text-xs font-mono max-w-md">
          <ImageOff size={16} className="shrink-0 opacity-60" />
          <span className="truncate">
            <RandomFontText text={`[IMAGE: ${alt || src}] (Failed to load)`} />
          </span>
        </span>
      </span>
    );
  }

  return (
    <span className={`block my-3 ${className}`}>
      <span className="relative inline-block max-w-full">
        {loading && (
          <span className="flex items-center justify-center w-64 h-40 border border-black/20 dark:border-white/20 bg-white dark:bg-black text-xs font-mono gap-2 animate-pulse">
            <Loader2 size={16} className="animate-spin opacity-50" />
            <RandomFontText text="[LOADING IMAGE...]" />
          </span>
        )}
        <img
          src={currentSrc}
          alt={alt || "Media Image"}
          className={`max-h-80 max-w-full object-contain border border-black dark:border-white bg-black/5 dark:bg-white/5 p-1 ${
            loading ? "hidden" : "block"
          }`}
          referrerPolicy="no-referrer"
          onLoad={() => setLoading(false)}
          onError={handleError}
        />
      </span>
      {alt && (
        <span className="block mt-1 text-[11px] font-mono opacity-75 italic">
          <RandomFontText text={alt} />
        </span>
      )}
    </span>
  );
};
