import React, { useState } from "react";
import { TranslationCardData } from "../types";
import { Volume2, Copy, Check, AlertCircle } from "lucide-react";
import { RandomFontText } from "../utils/randomFont";

export interface TranslationCardProps {
  data: TranslationCardData;
}

// Map short ISO codes to SpeechSynthesis locales
const LANG_VOICE_MAP: Record<string, string> = {
  en: "en-US",
  vi: "vi-VN",
  ja: "ja-JP",
  ko: "ko-KR",
  zh: "zh-CN",
  "zh-cn": "zh-CN",
  "zh-tw": "zh-TW",
  fr: "fr-FR",
  de: "de-DE",
  es: "es-ES",
  it: "it-IT",
  ru: "ru-RU",
  th: "th-TH",
  id: "id-ID",
  pt: "pt-BR",
  ar: "ar-SA",
  hi: "hi-IN",
};

export const TranslationCard: React.FC<TranslationCardProps> = ({ data }) => {
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const [copiedTranslated, setCopiedTranslated] = useState(false);
  const [speakingSide, setSpeakingSide] = useState<"left" | "right" | null>(null);

  const { originalText, translatedText, fromLang = "auto", toLang = "en", title, error } = data;

  const displayFromLang = (fromLang || "AUTO").toUpperCase();
  const displayToLang = (toLang || "EN").toUpperCase();

  const handleCopy = (text: string, isOriginal: boolean) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      if (isOriginal) {
        setCopiedOriginal(true);
        setTimeout(() => setCopiedOriginal(false), 2000);
      } else {
        setCopiedTranslated(true);
        setTimeout(() => setCopiedTranslated(false), 2000);
      }
    });
  };

  const handleSpeak = (text: string, langCode: string, side: "left" | "right") => {
    if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const cleanLang = langCode.toLowerCase();
      utterance.lang = LANG_VOICE_MAP[cleanLang] || cleanLang;
      utterance.rate = 0.95;

      utterance.onstart = () => setSpeakingSide(side);
      utterance.onend = () => setSpeakingSide(null);
      utterance.onerror = () => setSpeakingSide(null);

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis error:", e);
      setSpeakingSide(null);
    }
  };

  return (
    <div className="my-3 border border-[#000000] bg-[#000000] text-[#ffffff] rounded-xl overflow-hidden font-sans shadow-lg">
      {/* Optional Title Header */}
      {title && (
        <div className="px-4 py-2 border-b border-[#000000] bg-[#000000] text-xs font-semibold text-[#ffffff] tracking-wider uppercase">
          <RandomFontText text={title} />
        </div>
      )}

      {error ? (
        <div className="p-4 flex items-center space-x-2 opacity-80 font-bold text-xs">
          <AlertCircle size={15} className="shrink-0" />
          <span>Translation failed: {error}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#000000]">
          {/* Left Box (Source / Original) */}
          <div className="p-5 flex flex-col justify-between min-h-[140px] relative group">
            <div>
              <div className="text-base sm:text-lg font-bold text-white tracking-wide font-mono mb-2">
                {displayFromLang}
              </div>
              <div className="text-base sm:text-xl text-[#ffffff] whitespace-pre-wrap leading-relaxed font-sans">
                {originalText}
              </div>
            </div>

            {/* Bottom Actions for Source */}
            <div className="flex justify-end items-center mt-4">
              <div className="flex items-center bg-[#000000] border border-[#000000] rounded-lg p-1 space-x-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => handleSpeak(originalText, fromLang, "left")}
                  title="Listen"
                  className={`p-1.5 rounded transition-colors ${
                    speakingSide === "left"
                      ? "text-black bg-white"
                      : "text-[#ffffff] hover:text-[#ffffff]"
                  }`}
                >
                  <Volume2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(originalText, true)}
                  title="Copy text"
                  className="px-2 py-0.5 border border-[#000000] hover:border-white text-[11px] font-mono text-[#ffffff] hover:text-white transition-colors"
                >
                  <RandomFontText text={copiedOriginal ? "[COPIED]" : "[COPY]"} />
                </button>
              </div>
            </div>
          </div>

          {/* Right Box (Target / Translated) */}
          <div className="p-5 flex flex-col justify-between min-h-[140px] relative group bg-[#000000]/40">
            <div>
              <div className="text-base sm:text-lg font-bold text-white tracking-wide font-mono mb-2">
                {displayToLang}
              </div>
              <div className="text-base sm:text-xl text-[#ffffff] whitespace-pre-wrap leading-relaxed font-sans">
                {translatedText || <span className="text-[#ffffff] italic">Translating...</span>}
              </div>
            </div>

            {/* Bottom Actions for Translation */}
            <div className="flex justify-end items-center mt-4">
              <div className="flex items-center bg-[#000000] border border-[#000000] rounded-lg p-1 space-x-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => handleSpeak(translatedText, toLang, "right")}
                  title="Listen translation"
                  className={`p-1.5 rounded transition-colors ${
                    speakingSide === "right"
                      ? "text-black bg-white"
                      : "text-[#ffffff] hover:text-[#ffffff]"
                  }`}
                >
                  <Volume2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(translatedText, false)}
                  title="Copy translation"
                  className="px-2 py-0.5 border border-[#000000] hover:border-white text-[11px] font-mono text-[#ffffff] hover:text-white transition-colors"
                >
                  <RandomFontText text={copiedTranslated ? "[COPIED]" : "[COPY]"} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
