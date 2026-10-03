import React, { useState, useMemo } from "react";
import { PieChartDisplayData, PieChartSlice } from "../types";
import { parseThinkContent } from "../utils/parseThink";
import { PieChart as PieIcon, Table as TableIcon } from "lucide-react";
import { RandomFontText } from "../utils/randomFont";

const BW_ONLY_RE = /^(#000000|#ffffff|black|white|none|transparent|currentColor)$/i;

export interface PieChartDisplayCardProps {
  data: PieChartDisplayData;
}

/**
 * Black-and-white only palette. The card surface is black and every
 * slice is white, separated by a solid black stroke; every slice is
 * labeled with its name and percentage in the legend so values stay
 * readable.
 */
/**
 * Accept only black or white custom colors from data payloads.
 * Any other color falls back to the palette so the UI stays
 * strictly black-and-white.
 */
function pickPieColor(custom: unknown, idx: number): string {
  if (typeof custom === "string" && BW_ONLY_RE.test(custom.trim())) {
    const c = custom.trim().toLowerCase();
    if (c === "black") return "#000000";
    if (c === "white") return "#ffffff";
    return custom.trim();
  }
  return PIE_PALETTE[idx % PIE_PALETTE.length];
}

const PIE_PALETTE = [
  "#ffffff",
  "#ffffff",
  "#ffffff",
  "#ffffff",
  "#ffffff",
  "#ffffff",
  "#ffffff",
  "#ffffff",
  "#ffffff",
  "#ffffff",
];

/**
 * Helper to extract balanced braces or parens
 */
function extractBalancedBlock(text: string, startIndex: number, openChar: string, closeChar: string): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === openChar) {
        depth++;
      } else if (char === closeChar) {
        depth--;
        if (depth === 0) {
          return text.substring(startIndex, i + 1);
        }
      }
    }
  }
  return null;
}

/**
 * Normalize and validate pie chart payload
 */
function normalizePieChartData(raw: any): PieChartDisplayData | null {
  if (!raw || typeof raw !== "object") return null;
  if (!Array.isArray(raw.slices) || raw.slices.length === 0) return null;

  const validSlices: PieChartSlice[] = [];
  raw.slices.forEach((s: any, idx: number) => {
    if (!s || typeof s !== "object") return;
    const label = String(s.label ?? s.name ?? `Slice ${idx + 1}`);
    const val = Number(s.value ?? s.val ?? 0);
    if (isNaN(val) || val <= 0) return;
    const color = s.color ? String(s.color) : PIE_PALETTE[idx % PIE_PALETTE.length];
    validSlices.push({ label, value: val, color });
  });

  if (validSlices.length < 1) return null;

  const style = String(raw.style || "").toLowerCase() === "donut" ? "donut" : "pie";

  return {
    title: raw.title ? String(raw.title) : undefined,
    style,
    slices: validSlices,
    unit: raw.unit ? String(raw.unit) : undefined,
    show_legend: raw.show_legend !== undefined ? Boolean(raw.show_legend) : true,
    show_percentages: raw.show_percentages !== undefined ? Boolean(raw.show_percentages) : true,
  };
}

/**
 * Clean and parse JSON or YAML-like pie_chart_display_v0 payload
 */
function tryParsePieChartPayload(raw: string): PieChartDisplayData | null {
  if (!raw || typeof raw !== "string") return null;
  let trimmed = raw.trim();

  trimmed = trimmed.replace(/^`+|`+$/g, "").trim();

  // If starts with pie_chart_display_v0(...) or call:pie_chart_display_v0(...)
  const fnMatch = trimmed.match(/^(?:call:)?pie_chart_display_v0\s*\(([\s\S]*)\)$/i);
  if (fnMatch) {
    trimmed = fnMatch[1].trim();
  }

  // If parameters = { ... }
  const paramMatch = trimmed.match(/parameters\s*=\s*(\{[\s\S]*\})/i);
  if (paramMatch) {
    trimmed = paramMatch[1].trim();
  }

  try {
    const obj = JSON.parse(trimmed);
    if (obj) {
      if (obj.name === "pie_chart_display_v0" && obj.parameters) {
        return normalizePieChartData(obj.parameters);
      }
      if (obj.parameters && Array.isArray(obj.parameters.slices)) {
        return normalizePieChartData(obj.parameters);
      }
      if (Array.isArray(obj.slices)) {
        return normalizePieChartData(obj);
      }
    }
  } catch {
    // Lenient regex fallback
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*"slices"\s*:[\s\S]*\}/i);
  if (jsonMatch) {
    try {
      const fixed = jsonMatch[0]
        .replace(/#.*$/gm, "")
        .replace(/,\s*([\]}])/g, "$1");
      const obj = JSON.parse(fixed);
      if (obj) {
        if (obj.name === "pie_chart_display_v0" && obj.parameters) {
          return normalizePieChartData(obj.parameters);
        }
        if (Array.isArray(obj.slices)) {
          return normalizePieChartData(obj);
        }
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

/**
 * Extract pie_chart_display_v0 configurations from text
 */
export function extractPieChartDisplays(
  text: string,
  thinkStartTag?: string,
  thinkEndTag?: string
): PieChartDisplayData[] {
  if (!text || typeof text !== "string") return [];

  const parsed = parseThinkContent(text, thinkStartTag, thinkEndTag);
  const mainText = parsed.mainText;
  const results: PieChartDisplayData[] = [];

  // 1. Triple code blocks
  const codeBlockRegex = /```(?:json|yaml|yml)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = codeBlockRegex.exec(mainText)) !== null) {
    const blockContent = match[1];
    if (
      blockContent.includes("pie_chart_display_v0") ||
      (blockContent.includes('"slices"') && (blockContent.includes('"pie"') || blockContent.includes('"donut"') || blockContent.includes('"label"'))) ||
      (blockContent.includes('slices:') && (blockContent.includes('pie') || blockContent.includes('donut')))
    ) {
      const pieData = tryParsePieChartPayload(blockContent);
      if (pieData) {
        results.push(pieData);
      }
    }
  }

  // 2. Inline backticks `pie_chart_display_v0(...)`
  const inlineBlockRegex = /`([^`\n]*(?:pie_chart_display_v0|"slices"|'slices')[^`\n]*)`/gi;
  while ((match = inlineBlockRegex.exec(mainText)) !== null) {
    const blockContent = match[1];
    const pieData = tryParsePieChartPayload(blockContent);
    if (pieData) {
      results.push(pieData);
    }
  }

  // 3. Function call syntax: (?:call:)?pie_chart_display_v0\s*\(
  const fnRegex = /(?:call:)?pie_chart_display_v0\s*\(/gi;
  while ((match = fnRegex.exec(mainText)) !== null) {
    const openParenIndex = match.index + match[0].length - 1;
    const parenBlock = extractBalancedBlock(mainText, openParenIndex, "(", ")");
    if (parenBlock) {
      const pieData = tryParsePieChartPayload(parenBlock);
      if (pieData) {
        const alreadyAdded = results.some(
          (r) => JSON.stringify(r.slices) === JSON.stringify(pieData.slices)
        );
        if (!alreadyAdded) {
          results.push(pieData);
        }
      }
    }
  }

  // 4. Standalone JSON with "name": "pie_chart_display_v0"
  const jsonObjRegex = /\{\s*"name"\s*:\s*"pie_chart_display_v0"/gi;
  while ((match = jsonObjRegex.exec(mainText)) !== null) {
    const braceBlock = extractBalancedBlock(mainText, match.index, "{", "}");
    if (braceBlock) {
      const pieData = tryParsePieChartPayload(braceBlock);
      if (pieData) {
        const alreadyAdded = results.some(
          (r) => JSON.stringify(r.slices) === JSON.stringify(pieData.slices)
        );
        if (!alreadyAdded) {
          results.push(pieData);
        }
      }
    }
  }

  return results;
}

/**
 * Strip pie_chart_display_v0 blocks from message text
 */
export function stripPieChartDisplayCommands(text: string): string {
  if (!text || typeof text !== "string") return "";

  let clean = text;

  // Strip triple code blocks
  clean = clean
    .replace(
      /```(?:json|yaml|yml)?\s*(?:(?:#\s*)?pie_chart_display_v0)?\s*(\{\s*"name"\s*:\s*"pie_chart_display_v0"[\s\S]*?\})\s*```/gi,
      ""
    )
    .replace(
      /```(?:json|yaml|yml)?\s*(\{\s*"style"\s*:\s*"(?:pie|donut)"[\s\S]*?"slices"\s*:[\s\S]*?\})\s*```/gi,
      ""
    )
    .replace(
      /```(?:json|yaml|yml)?\s*pie_chart_display_v0[\s\S]*?```/gi,
      ""
    );

  // Strip inline backtick
  clean = clean.replace(/`\s*(?:call:)?pie_chart_display_v0\s*\([\s\S]*?\)\s*`/gi, "");
  clean = clean.replace(/`\s*\{[\s\S]*?"slices"\s*:[\s\S]*?\}\s*`/gi, "");

  // Strip standalone call
  const fnRegex = /(?:call:)?pie_chart_display_v0\s*\(/i;
  let fnMatch;
  while ((fnMatch = fnRegex.exec(clean)) !== null) {
    const openParenIndex = fnMatch.index + fnMatch[0].length - 1;
    const parenBlock = extractBalancedBlock(clean, openParenIndex, "(", ")");
    if (parenBlock) {
      const fullCall = clean.substring(fnMatch.index, openParenIndex + parenBlock.length);
      clean = clean.replace(fullCall, "");
    } else {
      break;
    }
  }

  // Strip standalone JSON
  const jsonObjRegex = /\{\s*"name"\s*:\s*"pie_chart_display_v0"/i;
  let jsonMatch;
  while ((jsonMatch = jsonObjRegex.exec(clean)) !== null) {
    const braceBlock = extractBalancedBlock(clean, jsonMatch.index, "{", "}");
    if (braceBlock) {
      clean = clean.replace(braceBlock, "");
    } else {
      break;
    }
  }

  // Clean empty backticks
  clean = clean
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return clean;
}

export const PieChartDisplayCard: React.FC<PieChartDisplayCardProps> = ({ data }) => {
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { title, style = "pie", slices, unit, show_legend = true, show_percentages = true } = data;

  const totalValue = useMemo(() => {
    return slices.reduce((acc, curr) => acc + curr.value, 0);
  }, [slices]);

  // SVG Geometry Constants
  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = 115;
  const innerRadius = style === "donut" ? 68 : 0;

  // Compute angles and slice paths
  const sliceAngles = useMemo(() => {
    let currentAngle = -Math.PI / 2; // start from top (12 o'clock)
    return slices.map((s, idx) => {
      const fraction = totalValue > 0 ? s.value / totalValue : 0;
      const angleDelta = fraction * 2 * Math.PI;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angleDelta;
      currentAngle = endAngle;

      const midAngle = startAngle + angleDelta / 2;
      const percentage = Math.round(fraction * 1000) / 10; // 1 decimal

      return {
        ...s,
        index: idx,
        fraction,
        percentage,
        startAngle,
        endAngle,
        midAngle,
        color: pickPieColor(s.color, idx),
      };
    });
  }, [slices, totalValue]);

  // Generate SVG Path for a pie or donut slice
  const getSlicePath = (
    startAngle: number,
    endAngle: number,
    outerR: number,
    innerR: number
  ) => {
    // If single slice covering whole circle
    if (Math.abs(endAngle - startAngle) >= 2 * Math.PI - 0.001) {
      if (innerR === 0) {
        return `M ${cx} ${cy - outerR} A ${outerR} ${outerR} 0 1 1 ${cx} ${cy + outerR} A ${outerR} ${outerR} 0 1 1 ${cx} ${cy - outerR} Z`;
      } else {
        return `M ${cx} ${cy - outerR} A ${outerR} ${outerR} 0 1 1 ${cx} ${cy + outerR} A ${outerR} ${outerR} 0 1 1 ${cx} ${cy - outerR} M ${cx} ${cy - innerR} A ${innerR} ${innerR} 0 1 0 ${cx} ${cy + innerR} A ${innerR} ${innerR} 0 1 0 ${cx} ${cy - innerR} Z`;
      }
    }

    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    if (innerR === 0) {
      return `M ${cx} ${cy} L ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    }

    const inX1 = cx + innerR * Math.cos(startAngle);
    const inY1 = cy + innerR * Math.sin(startAngle);
    const inX2 = cx + innerR * Math.cos(endAngle);
    const inY2 = cy + innerR * Math.sin(endAngle);

    return `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L ${inX2} ${inY2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${inX1} ${inY1} Z`;
  };

  const hoveredSlice = hoveredIndex !== null ? sliceAngles[hoveredIndex] : null;

  return (
    <div className="my-3 border border-[#000000] bg-[#000000] text-[#ffffff] rounded-xl overflow-hidden font-sans shadow-lg select-none">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-4 pb-2">
        <div>
          {title && (
            <h3 className="text-sm sm:text-base font-semibold text-white tracking-tight leading-tight">
              <RandomFontText text={title} />
            </h3>
          )}
          <p className="text-xs text-[#ffffff] mt-1 font-normal">
            {style === "donut" ? "Donut Chart" : "Pie Chart"}
            {unit ? ` (${unit})` : ""}
          </p>
        </div>

        {/* View Toggle Pill */}
        <div className="flex items-center bg-[#000000] border border-[#000000] rounded-lg p-0.5 shrink-0 ml-3">
          <button
            type="button"
            onClick={() => setViewMode("chart")}
            title="Chart View"
            className={`p-1 rounded-md transition-all flex items-center justify-center ${
              viewMode === "chart"
                ? "border border-white bg-white/10 text-white shadow-sm"
                : "border border-transparent text-[#ffffff] hover:text-[#ffffff]"
            }`}
          >
            <PieIcon size={15} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            title="Table View"
            className={`p-1 rounded-md transition-all flex items-center justify-center ${
              viewMode === "table"
                ? "border border-white bg-white/10 text-white shadow-sm"
                : "border border-transparent text-[#ffffff] hover:text-[#ffffff]"
            }`}
          >
            <TableIcon size={15} />
          </button>
        </div>
      </div>

      {/* Body: Chart View */}
      {viewMode === "chart" && (
        <div className="px-5 pb-5 pt-2 flex flex-col items-center">
          <div className="relative flex items-center justify-center">
            <svg
              viewBox={`0 0 ${size} ${size}`}
              className="w-64 h-64 sm:w-72 sm:h-72 max-w-full"
            >
              {sliceAngles.map((slice) => {
                const isHovered = hoveredIndex === slice.index;
                const rOffset = isHovered ? 6 : 0;
                const activeOuterR = outerRadius + rOffset;
                const activeInnerR = innerRadius > 0 ? innerRadius - (isHovered ? 2 : 0) : 0;

                // Path with slight explosion outward when hovered
                const shiftX = isHovered ? 5 * Math.cos(slice.midAngle) : 0;
                const shiftY = isHovered ? 5 * Math.sin(slice.midAngle) : 0;

                const pathD = getSlicePath(
                  slice.startAngle,
                  slice.endAngle,
                  activeOuterR,
                  activeInnerR
                );

                // Label coordinates on slice if enough space
                const labelR = innerRadius > 0 ? (innerRadius + outerRadius) / 2 : outerRadius * 0.65;
                const labelX = cx + labelR * Math.cos(slice.midAngle) + shiftX;
                const labelY = cy + labelR * Math.sin(slice.midAngle) + shiftY;

                return (
                  <g
                    key={`slice-g-${slice.index}`}
                    className="cursor-pointer transition-transform duration-150"
                    onMouseEnter={() => setHoveredIndex(slice.index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <path
                      d={pathD}
                      fill={slice.color}
                      transform={`translate(${shiftX}, ${shiftY})`}
                      stroke="#000000"
                      strokeWidth={1.5}
                      className="transition-all duration-150"
                    />

                    {/* Percentage text directly on large slices */}
                    {show_percentages && slice.percentage >= 6 && (
                      <text
                        x={labelX}
                        y={labelY + 4}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize={11}
                        fontWeight="600"
                        fontFamily="sans-serif"
                        className="pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                      >
                        {slice.percentage}%
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Donut Center Display */}
              {style === "donut" && (
                <g className="pointer-events-none">
                  <circle cx={cx} cy={cy} r={innerRadius - 2} fill="#000000" />
                  <text
                    x={cx}
                    y={cy - 4}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize={10}
                    fontFamily="sans-serif"
                  >
                    {hoveredSlice ? hoveredSlice.label : "Total"}
                  </text>
                  <text
                    x={cx}
                    y={cy + 14}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize={13}
                    fontWeight="bold"
                    fontFamily="sans-serif"
                  >
                    {hoveredSlice
                      ? `${hoveredSlice.value}${unit ? ` ${unit}` : ""}`
                      : `${totalValue}${unit ? ` ${unit}` : ""}`}
                  </text>
                </g>
              )}
            </svg>

            {/* Hover Tooltip Box */}
            {hoveredSlice && (
              <div className="absolute top-2 right-2 bg-[#000000] border border-[#000000] rounded-lg shadow-2xl p-2.5 min-w-[130px] text-xs font-sans pointer-events-none transition-all duration-100 z-10">
                <div className="flex items-center space-x-1.5 mb-1">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: hoveredSlice.color }}
                  />
                  <span className="font-semibold text-white truncate">
                    {hoveredSlice.label}
                  </span>
                </div>
                <div className="text-[#ffffff] flex justify-between gap-3">
                  <span>Value:</span>
                  <span className="font-bold text-white">
                    {hoveredSlice.value}
                    {unit ? ` ${unit}` : ""}
                  </span>
                </div>
                <div className="text-[#ffffff] flex justify-between gap-3">
                  <span>Share:</span>
                  <span className="font-bold text-white">
                    {hoveredSlice.percentage}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          {show_legend && (
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mt-3 pt-3 border-t border-[#000000] w-full text-xs">
              {sliceAngles.map((slice) => {
                const isHovered = hoveredIndex === slice.index;
                return (
                  <div
                    key={`legend-pie-${slice.index}`}
                    className={`flex items-center space-x-1.5 cursor-pointer py-0.5 px-1.5 rounded transition-colors ${
                      isHovered ? "bg-[#000000] text-white" : "text-[#ffffff] hover:text-white"
                    }`}
                    onMouseEnter={() => setHoveredIndex(slice.index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="truncate max-w-[120px]">{slice.label}</span>
                    <span className="text-[#ffffff] font-mono">({slice.percentage}%)</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Body: Table View */}
      {viewMode === "table" && (
        <div className="px-5 pb-5 pt-2">
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs font-sans">
              <thead>
                <tr className="text-[#ffffff] border-b border-[#000000]">
                  <th className="py-2.5 pr-4 font-normal text-[#ffffff]">Category</th>
                  <th className="py-2.5 pr-4 font-normal text-[#ffffff] text-right">
                    Value {unit ? `(${unit})` : ""}
                  </th>
                  <th className="py-2.5 pr-4 font-normal text-[#ffffff] text-right">Share (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#000000]">
                {sliceAngles.map((slice, rowIdx) => (
                  <tr
                    key={`row-pie-${rowIdx}`}
                    className="hover:bg-[#000000] transition-colors"
                  >
                    <td className="py-3 pr-4 text-white font-medium flex items-center space-x-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span>{slice.label}</span>
                    </td>
                    <td className="py-3 pr-4 text-[#ffffff] text-right font-mono">
                      {slice.value}
                    </td>
                    <td className="py-3 pr-4 text-white text-right font-mono font-semibold">
                      {slice.percentage}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
