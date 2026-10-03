import React, { useState } from "react";
import { MapPlace } from "../types";

export interface MapEmbedCardProps {
  places: MapPlace[];
  title?: string;
}

export const SHOW_MAP_REGEX =
  /(?:```[a-z]*\s*)?(?:call:)?show_map\s*\(\s*([\s\S]*?)\s*\)(?:\s*```)?/gi;

export interface ShowMapCommand {
  places: MapPlace[];
  title?: string;
}

/**
 * Parse all show_map(...) commands found in model output text.
 * Expects syntax: show_map([{"name": "Location Name"}, ...], title="Optional Title")
 * Also accepts simple string array: show_map(["Loc 1", "Loc 2"])
 */
export function extractShowMapCommands(text: string): ShowMapCommand[] {
  if (!text || typeof text !== "string") return [];
  const results: ShowMapCommand[] = [];
  const regex = new RegExp(SHOW_MAP_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    try {
      const argsStr = match[1].trim();
      let places: MapPlace[] = [];
      let title: string | undefined;

      if (argsStr.startsWith("[")) {
        const arrayEndIdx = argsStr.lastIndexOf("]");
        if (arrayEndIdx !== -1) {
          const arrayStr = argsStr.substring(0, arrayEndIdx + 1).replace(/'/g, '"');
          const parsed = JSON.parse(arrayStr);
          places = (Array.isArray(parsed) ? parsed : [])
            .map((p: any) => {
              if (typeof p === "string") return { name: p.trim() };
              if (p && typeof p.name === "string") return { name: p.name.trim() };
              return null;
            })
            .filter((p): p is MapPlace => Boolean(p && p.name));

          const rest = argsStr.substring(arrayEndIdx + 1);
          const titleMatch = rest.match(/title\s*=\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)')/);
          if (titleMatch) {
            title = titleMatch[1] || titleMatch[2];
          }
        }
      } else {
        const stringMatches = [...argsStr.matchAll(/(?:"([^"\r\n]+)"|'([^'\r\n]+)')/g)];
        for (const sm of stringMatches) {
          const str = (sm[1] || sm[2]).trim();
          if (!str) continue;
          if (argsStr.substring(Math.max(0, sm.index - 10), sm.index).includes("title=")) {
            title = str;
          } else {
            places.push({ name: str });
          }
        }
      }

      if (places.length > 0) {
        results.push({ places, title });
      }
    } catch {
      continue;
    }
  }

  return results;
}

/** Strip show_map(...) commands from displayed text */
export function stripShowMapCommands(text: string): string {
  if (!text) return "";
  return text
    .replace(new RegExp(SHOW_MAP_REGEX.source, "gi"), "")
    .replace(/(?:```[a-z]*\s*|`|["'])?show_map\s*\([\s\S]*$/gi, "");
}

export const MapEmbedCard: React.FC<MapEmbedCardProps> = ({ places, title }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const validPlaces = places.filter((p) => p && p.name && p.name.trim());
  if (validPlaces.length === 0) return null;

  const currentIndex = selectedIndex >= 0 && selectedIndex < validPlaces.length ? selectedIndex : 0;
  const currentPlace = validPlaces[currentIndex];

  const queryTarget = encodeURIComponent(currentPlace.name.trim());
  const zoom = 15;
  const embedUrl = `https://maps.google.com/maps?q=${queryTarget}&t=m&z=${zoom}&output=embed`;

  return (
    <div className="w-full my-3 border border-black dark:border-white bg-white dark:bg-black font-sans rounded-none overflow-hidden">
      {/* Top action banner */}
      <div className="flex items-center justify-between gap-2 border-b border-black/20 dark:border-white/20 px-3 py-2 text-xs bg-white dark:bg-black text-black dark:text-white">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono uppercase tracking-wider font-semibold truncate">
            {title ? title : "Map Card"}
          </span>
          {validPlaces.length > 1 && (
            <span className="text-[11px] font-mono px-1.5 py-0.5 border border-black/20 dark:border-white/20 bg-white dark:bg-black text-black dark:text-white shrink-0">
              {currentIndex + 1}/{validPlaces.length}
            </span>
          )}
        </div>
      </div>

      {/* Main container: Split if multiple places, single iframe if 1 place */}
      <div className="flex flex-col md:flex-row h-[360px] sm:h-[400px]">
        {/* Places List (when > 1 place) */}
        {validPlaces.length > 1 && (
          <div className="w-full md:w-64 lg:w-72 border-b md:border-b-0 md:border-r border-black/20 dark:border-white/20 bg-white dark:bg-black flex flex-col shrink-0 overflow-hidden h-36 md:h-full">
            <div className="px-3 py-2 border-b border-black/10 dark:border-white/10 text-[11px] font-mono uppercase tracking-wider text-black dark:text-white flex items-center justify-between">
              <span>Places ({validPlaces.length})</span>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
              {validPlaces.map((p, idx) => {
                const isSelected = idx === currentIndex;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedIndex(idx)}
                    className={`w-full text-left flex items-start gap-2.5 p-2 rounded-none transition-colors border ${
                      isSelected
                        ? "border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-medium shadow-xs"
                        : "border-transparent hover:border-black/20 dark:border-white/20 text-black dark:text-white hover:bg-white/50 dark:hover:bg-black"
                    }`}
                  >
                    <span className="w-5 h-5 flex items-center justify-center shrink-0 border border-black/20 dark:border-white/20 text-[10px] font-mono bg-white dark:bg-black text-black dark:text-white mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs truncate">{p.name}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Embedded Google Maps iframe */}
        <div className="relative flex-1 w-full h-full min-h-[220px] bg-white dark:bg-black">
          <iframe
            key={`${queryTarget}-${zoom}`}
            title={`Google Map - ${currentPlace.name}`}
            src={embedUrl}
            className="h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </div>
  );
};
