import React, { useState } from "react";
import { WeatherCardData } from "../types";
import { AlertCircle, Download, Code, Check } from "lucide-react";
import { RandomFontText } from "../utils/randomFont";
import { 
  SunnyBackground, 
  CloudyBackground, 
  WindyBackground, 
  FogBackground, 
  SnowBackground, 
  RainyBackground, 
  StormBackground 
} from "./WeatherBackgrounds";
import { exportWeatherCardTsx, exportWeatherCardHtml, copyWeatherCardSource } from "../utils/exportWeatherCard";

export const WeatherCard: React.FC<{ data: WeatherCardData; className?: string; showExport?: boolean }> = ({ data, className = "", showExport = true }) => {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  if (data.error) {
    return (
      <div className="my-3 p-4 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-bold flex items-center space-x-2 text-sm">
        <AlertCircle size={16} />
        <span>{data.error}</span>
      </div>
    );
  }

  const getBackground = (condition: string) => {
    switch (condition.toLowerCase()) {
      case "sunny":
      case "clear":
        return SunnyBackground;
      case "cloudy":
        return CloudyBackground;
      case "windy":
        return WindyBackground;
      case "fog":
      case "foggy":
        return FogBackground;
      case "snow":
      case "snowy":
        return SnowBackground;
      case "rainy":
      case "rain":
        return RainyBackground;
      case "stormy":
      case "storm":
        return StormBackground;
      default:
        return CloudyBackground;
    }
  };

  const Background = getBackground(data.condition);

  const handleCopyCode = async () => {
    const ok = await copyWeatherCardSource();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`card relative group my-2 w-[300px] sm:w-[310px] bg-white rounded-[18px] overflow-hidden shadow-[0_12px_28px_rgba(30,40,60,0.10)] font-sans border border-black/5 dark:border-white/10 ${className}`}>
      {/* Top Section */}
      <div className="card-top relative h-[148px] overflow-hidden">
        {/* SVG Illustration Background */}
        <Background />

        {/* Content Info Overlay */}
        <div className="card-info absolute top-4 left-[18px] text-white select-none drop-shadow-[0_1px_6px_rgba(0,0,0,0.08)] z-10 pointer-events-none">
          <div className="temp flex items-baseline gap-[7px] text-[32px] font-bold leading-none">
            <span>{Math.round(data.temperature)}</span>
            <span className="deg text-[32px] font-bold">°</span>
          </div>
          <div className="cond text-[13.5px] font-normal opacity-90 mt-[2px]">{data.condition}</div>
          <div className="loc text-[12.5px] font-normal opacity-85 mt-[3px]">{data.location}</div>
        </div>

        {/* Export Button inside Card (only shown in dedicated showcase/settings views, not in normal chat) */}
        {showExport && (
          <div className="absolute top-2.5 right-2.5 z-20">
            <button
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-1.5 py-0.5 bg-black/40 hover:bg-black/70 text-white rounded text-[10px] font-mono font-bold tracking-wider backdrop-blur-sm transition-colors flex items-center space-x-1 border border-white/20 cursor-pointer"
              title="Export WeatherCard component to edit and send back"
            >
              <Download size={10} />
              <span>EXPORT</span>
            </button>
          </div>
        )}
      </div>
      
      {/* Bottom Section */}
      <div className="card-bottom flex justify-between items-center px-[18px] py-[13px] bg-white border-t border-black/5">
        <div className="time text-[15px] font-semibold text-black">{data.time || "09:30"}</div>
        <div className="date text-[12.5px] text-black/60">{data.date || "Mon.Mar 26"}</div>
      </div>

      {/* Export Options Dropdown Overlay */}
      {showExport && showExportMenu && (
        <div className="absolute inset-0 z-30 bg-black/90 text-white p-4 flex flex-col justify-between font-mono animate-fadeIn">
          <div className="flex items-center justify-between border-b border-white/20 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white">[EXPORT_WEATHER_CARD]</span>
            <button
              type="button"
              onClick={() => setShowExportMenu(false)}
              className="text-xs text-white/60 hover:text-white px-1 cursor-pointer"
            >
              [ESC]
            </button>
          </div>

          <div className="space-y-2 py-2">
            <p className="text-[10px] text-white/70 leading-tight">
              Export source to customize layers/styles in VS Code/HTML and send back to the AI:
            </p>
            
            <button
              type="button"
              onClick={() => {
                exportWeatherCardTsx();
                setShowExportMenu(false);
              }}
              className="w-full text-left px-2.5 py-1.5 bg-white text-black text-[11px] font-bold hover:bg-white/90 flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center space-x-1.5">
                <Download size={12} />
                <span>DOWNLOAD WeatherCard.tsx</span>
              </span>
              <span className="text-[9px] opacity-70">.TSX</span>
            </button>

            <button
              type="button"
              onClick={() => {
                exportWeatherCardHtml();
                setShowExportMenu(false);
              }}
              className="w-full text-left px-2.5 py-1.5 border border-white/40 text-white text-[11px] font-bold hover:bg-white/10 flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center space-x-1.5">
                <Code size={12} />
                <span>DOWNLOAD STANDALONE HTML</span>
              </span>
              <span className="text-[9px] opacity-70">.HTML</span>
            </button>

            <button
              type="button"
              onClick={handleCopyCode}
              className="w-full text-left px-2.5 py-1.5 border border-white/40 text-white text-[11px] font-bold uppercase hover:bg-white hover:text-black flex items-center justify-between cursor-pointer transition-colors"
            >
              <RandomFontText text={copied ? "[COPIED SOURCE]" : "[COPY SOURCE CODE]"} />
              <span className="text-[9px] opacity-70 font-mono">{copied ? "DONE" : ".TSX"}</span>
            </button>
          </div>

          <div className="text-right pt-1">
            <button
              type="button"
              onClick={() => setShowExportMenu(false)}
              className="text-[10px] text-white/60 hover:text-white underline cursor-pointer"
            >
              <RandomFontText text="[CLOSE]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
