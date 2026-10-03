import React, { useState, useMemo } from "react";
import { ChartDisplayData, ChartSeries } from "../types";
import { parseThinkContent } from "../utils/parseThink";
import { TrendingUp, Table as TableIcon } from "lucide-react";
import { RandomFontText } from "../utils/randomFont";

export interface ChartDisplayCardProps {
  data: ChartDisplayData;
}

/**
 * Black-and-white palette (see PALETTE and SERIES_DASH above).
 * The card surface is black, so every series renders in white;
 * series are told apart by dash pattern (solid / dashed / dotted)
 * and by the legend labels.
 */
/**
 * Black-and-white only palette. The card surface is black, so every
 * series renders in white; series are told apart by dash pattern
 * (SERIES_DASH) and by the legend labels.
 */
const PALETTE = [
  "#ffffff", // Series 1: white solid
  "#ffffff", // Series 2: white dashed (see SERIES_DASH)
  "#ffffff", // Series 3: white dotted (see SERIES_DASH)
  "#ffffff",
  "#ffffff",
  "#ffffff",
  "#ffffff",
];

/** Dash pattern per series index: solid, dashed, dotted, then repeat. */
const SERIES_DASH: (string | undefined)[] = [undefined, "6 3", "2 3"];

const BW_ONLY_RE = /^(#000000|#ffffff|black|white|none|transparent|currentColor)$/i;

/**
 * Accept only black or white custom colors from data payloads.
 * Any other color falls back to the palette so the UI stays
 * strictly black-and-white.
 */
function pickSeriesColor(custom: unknown, idx: number): string {
  if (typeof custom === "string" && BW_ONLY_RE.test(custom.trim())) {
    const c = custom.trim().toLowerCase();
    if (c === "black") return "#000000";
    if (c === "white") return "#ffffff";
    return custom.trim();
  }
  return PALETTE[idx % PALETTE.length];
}

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
      if (!inString) {
        inString = true;
      } else {
        inString = false;
      }
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
 * Clean and parse JSON or YAML-like chart_display_v0 payload
 */
function tryParseChartPayload(raw: string): ChartDisplayData | null {
  if (!raw || typeof raw !== "string") return null;
  let trimmed = raw.trim();

  // Strip leading backticks or labels
  trimmed = trimmed.replace(/^`+|`+$/g, "").trim();

  // If it starts with chart_display_v0(...) or call:chart_display_v0(...)
  const fnMatch = trimmed.match(/^(?:call:)?chart_display_v0\s*\(([\s\S]*)\)$/i);
  if (fnMatch) {
    trimmed = fnMatch[1].trim();
  }

  // If it has parameters = { ... }
  const paramMatch = trimmed.match(/parameters\s*=\s*(\{[\s\S]*\})/i);
  if (paramMatch) {
    trimmed = paramMatch[1].trim();
  }

  // Try direct JSON parse
  try {
    const obj = JSON.parse(trimmed);
    if (obj) {
      if (obj.name === "chart_display_v0" && obj.parameters) {
        return normalizeChartData(obj.parameters);
      }
      if (obj.style && Array.isArray(obj.series)) {
        return normalizeChartData(obj);
      }
      if (obj.parameters && obj.parameters.style && Array.isArray(obj.parameters.series)) {
        return normalizeChartData(obj.parameters);
      }
    }
  } catch {
    // Lenient regex fallback
  }

  // Look for JSON object substring
  const jsonMatch = trimmed.match(/\{[\s\S]*"style"\s*:\s*"?(line|bar|scatter)"?[\s\S]*"series"\s*:[\s\S]*\}/i);
  if (jsonMatch) {
    try {
      const fixed = jsonMatch[0]
        .replace(/#.*$/gm, "") // remove comments
        .replace(/,\s*([\]}])/g, "$1"); // remove trailing commas
      const obj = JSON.parse(fixed);
      if (obj) {
        if (obj.name === "chart_display_v0" && obj.parameters) {
          return normalizeChartData(obj.parameters);
        }
        if (obj.style && Array.isArray(obj.series)) {
          return normalizeChartData(obj);
        }
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

/**
 * Normalize and validate chart payload
 */
function normalizeChartData(raw: any): ChartDisplayData | null {
  if (!raw || typeof raw !== "object") return null;
  const style = String(raw.style || "").toLowerCase().trim();
  if (style !== "line" && style !== "bar" && style !== "scatter") return null;
  if (!Array.isArray(raw.series) || raw.series.length === 0) return null;

  const series: ChartSeries[] = raw.series.map((s: any, idx: number) => {
    const name = s.name ? String(s.name) : undefined;
    const color = pickSeriesColor(s.color, idx);
    const values = Array.isArray(s.values)
      ? s.values.map((v: any) => (v === null || v === undefined || isNaN(Number(v)) ? null : Number(v)))
      : undefined;
    const points = Array.isArray(s.points)
      ? s.points
          .map((p: any) => ({
            x: isNaN(Number(p?.x)) ? String(p?.x ?? "") : Number(p?.x),
            y: Number(p?.y ?? 0),
          }))
          .filter((p: any) => !isNaN(p.y))
      : undefined;

    return { name, color, values, points };
  });

  return {
    style: style as "line" | "bar" | "scatter",
    title: raw.title ? String(raw.title) : undefined,
    series,
    x_axis: raw.x_axis && typeof raw.x_axis === "object" ? {
      data: Array.isArray(raw.x_axis.data) ? raw.x_axis.data.map((d: any) => String(d)) : undefined,
      title: raw.x_axis.title ? String(raw.x_axis.title) : undefined,
      format: raw.x_axis.format ? String(raw.x_axis.format) : undefined,
      min: raw.x_axis.min !== undefined ? Number(raw.x_axis.min) : undefined,
      max: raw.x_axis.max !== undefined ? Number(raw.x_axis.max) : undefined,
      scale: raw.x_axis.scale === "log" ? "log" : "linear",
    } : undefined,
    y_axis: raw.y_axis && typeof raw.y_axis === "object" ? {
      data: Array.isArray(raw.y_axis.data) ? raw.y_axis.data.map((d: any) => String(d)) : undefined,
      title: raw.y_axis.title ? String(raw.y_axis.title) : undefined,
      format: raw.y_axis.format ? String(raw.y_axis.format) : undefined,
      min: raw.y_axis.min !== undefined ? Number(raw.y_axis.min) : undefined,
      max: raw.y_axis.max !== undefined ? Number(raw.y_axis.max) : undefined,
      scale: raw.y_axis.scale === "log" ? "log" : "linear",
    } : undefined,
  };
}

/**
 * Extract chart_display_v0 configurations from text
 */
export function extractChartDisplays(
  text: string,
  thinkStartTag?: string,
  thinkEndTag?: string
): ChartDisplayData[] {
  if (!text || typeof text !== "string") return [];

  const parsed = parseThinkContent(text, thinkStartTag, thinkEndTag);
  const mainText = parsed.mainText;
  const results: ChartDisplayData[] = [];

  // 1. Match ```json / ```yaml / ``` blocks containing chart_display_v0 or chart style
  const codeBlockRegex = /```(?:json|yaml|yml)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = codeBlockRegex.exec(mainText)) !== null) {
    const blockContent = match[1];
    if (
      blockContent.includes("chart_display_v0") ||
      (blockContent.includes('"style"') && blockContent.includes('"series"')) ||
      (blockContent.includes('style:') && blockContent.includes('series:'))
    ) {
      const chartData = tryParseChartPayload(blockContent);
      if (chartData) {
        results.push(chartData);
      }
    }
  }

  // 2. Match inline backtick blocks `chart_display_v0(...)` or `{"style": ...}`
  const inlineBlockRegex = /`([^`\n]*(?:chart_display_v0|"style"|'style')[^`\n]*)`/gi;
  while ((match = inlineBlockRegex.exec(mainText)) !== null) {
    const blockContent = match[1];
    const chartData = tryParseChartPayload(blockContent);
    if (chartData) {
      results.push(chartData);
    }
  }

  // 3. Match function call syntax: (?:call:)?chart_display_v0\s*\(...
  const fnRegex = /(?:call:)?chart_display_v0\s*\(/gi;
  while ((match = fnRegex.exec(mainText)) !== null) {
    const openParenIndex = match.index + match[0].length - 1;
    const parenBlock = extractBalancedBlock(mainText, openParenIndex, "(", ")");
    if (parenBlock) {
      const chartData = tryParseChartPayload(parenBlock);
      if (chartData) {
        // Avoid duplicate if already extracted
        const alreadyAdded = results.some(
          (r) => JSON.stringify(r.series) === JSON.stringify(chartData.series)
        );
        if (!alreadyAdded) {
          results.push(chartData);
        }
      }
    }
  }

  // 4. Match standalone JSON object with "name": "chart_display_v0"
  const jsonObjRegex = /\{\s*"name"\s*:\s*"chart_display_v0"/gi;
  while ((match = jsonObjRegex.exec(mainText)) !== null) {
    const braceBlock = extractBalancedBlock(mainText, match.index, "{", "}");
    if (braceBlock) {
      const chartData = tryParseChartPayload(braceBlock);
      if (chartData) {
        const alreadyAdded = results.some(
          (r) => JSON.stringify(r.series) === JSON.stringify(chartData.series)
        );
        if (!alreadyAdded) {
          results.push(chartData);
        }
      }
    }
  }

  return results;
}

/**
 * Strip chart_display_v0 blocks from visible message text
 */
export function stripChartDisplayCommands(text: string): string {
  if (!text || typeof text !== "string") return "";

  let clean = text;

  // Strip triple code blocks
  clean = clean
    .replace(
      /```(?:json|yaml|yml)?\s*(?:(?:#\s*)?chart_display_v0)?\s*(\{\s*"name"\s*:\s*"chart_display_v0"[\s\S]*?\})\s*```/gi,
      ""
    )
    .replace(
      /```(?:json|yaml|yml)?\s*(\{\s*"style"\s*:\s*"(?:line|bar|scatter)"[\s\S]*?"series"\s*:[\s\S]*?\})\s*```/gi,
      ""
    )
    .replace(
      /```(?:json|yaml|yml)?\s*chart_display_v0[\s\S]*?```/gi,
      ""
    );

  // Strip inline backtick `chart_display_v0(...)`
  clean = clean.replace(/`\s*(?:call:)?chart_display_v0\s*\([\s\S]*?\)\s*`/gi, "");
  clean = clean.replace(/`\s*\{[\s\S]*?"style"\s*:\s*"(?:line|bar|scatter)"[\s\S]*?\}\s*`/gi, "");

  // Strip standalone (?:call:)?chart_display_v0(...)
  const fnRegex = /(?:call:)?chart_display_v0\s*\(/i;
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

  // Strip standalone JSON object with "name": "chart_display_v0"
  const jsonObjRegex = /\{\s*"name"\s*:\s*"chart_display_v0"/i;
  let jsonMatch;
  while ((jsonMatch = jsonObjRegex.exec(clean)) !== null) {
    const braceBlock = extractBalancedBlock(clean, jsonMatch.index, "{", "}");
    if (braceBlock) {
      clean = clean.replace(braceBlock, "");
    } else {
      break;
    }
  }

  // Clean empty backticks or whitespace
  clean = clean
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return clean;
}

export const ChartDisplayCard: React.FC<ChartDisplayCardProps> = ({ data }) => {
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { style, title, series, x_axis, y_axis } = data;

  // Extract category names for X-axis
  const categories: string[] = useMemo(() => {
    if (x_axis?.data && Array.isArray(x_axis.data) && x_axis.data.length > 0) {
      return x_axis.data.map((d: any) => String(d));
    }
    const firstValues = series[0]?.values;
    if (firstValues && firstValues.length > 0) {
      return firstValues.map((_, i) => `T${i + 1}`);
    }
    const firstPoints = series[0]?.points;
    if (firstPoints && firstPoints.length > 0) {
      return firstPoints.map(p => String(p.x));
    }
    return [];
  }, [x_axis, series]);

  // Compute numerical bounds for Y-axis
  const { minY, maxY, yTicks } = useMemo(() => {
    let allYValues: number[] = [];

    series.forEach((s) => {
      if (s.values) {
        s.values.forEach((v) => {
          if (v !== null && v !== undefined && !isNaN(v)) {
            allYValues.push(v);
          }
        });
      }
      if (s.points) {
        s.points.forEach((p) => {
          if (!isNaN(p.y)) {
            allYValues.push(p.y);
          }
        });
      }
    });

    if (allYValues.length === 0) allYValues = [0, 10];

    const minVal = Math.min(...allYValues);
    const maxVal = Math.max(...allYValues);

    let low = y_axis?.min !== undefined ? y_axis.min : style === "bar" ? 0 : Math.min(0, minVal);
    if (style !== "bar" && y_axis?.min === undefined) {
      low = minVal > 0 ? Math.floor(minVal / 2) * 2 : Math.floor(minVal);
      if (low > minVal) low = Math.floor(minVal);
    }

    let high = y_axis?.max !== undefined ? y_axis.max : maxVal;
    if (high === low) high = low + 10;
    if (high <= 0) high = 10;

    // Nice tick step calculation
    const range = high - low;
    const rawStep = range / 5;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
    const stepOptions = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
    let step = stepOptions.find((opt) => opt * magnitude >= rawStep) || rawStep;
    if (typeof step === "number" && step > 0) {
      step = step * magnitude >= rawStep ? step * magnitude : step;
    } else {
      step = Math.ceil(rawStep);
    }
    if (step <= 0) step = 1;

    const roundedLow = Math.floor(low / step) * step;
    const roundedHigh = Math.ceil(high / step) * step;

    const ticks: number[] = [];
    for (let t = roundedLow; t <= roundedHigh + step * 0.001; t += step) {
      ticks.push(Math.round(t * 100) / 100);
    }

    return {
      minY: roundedLow,
      maxY: roundedHigh === roundedLow ? roundedLow + 10 : roundedHigh,
      yTicks: ticks,
    };
  }, [series, style, y_axis]);

  // Dimensions & padding for SVG coordinate space
  const svgWidth = 650;
  const svgHeight = 270;
  const padLeft = 44;
  const padRight = 24;
  const padTop = 22;
  const padBottom = 34;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  const getYCoord = (val: number) => {
    if (maxY === minY) return padTop + plotHeight / 2;
    const norm = (val - minY) / (maxY - minY);
    return padTop + plotHeight - norm * plotHeight;
  };

  const getXCoord = (index: number, total: number) => {
    if (total <= 1) return padLeft + plotWidth / 2;
    if (style === "bar") {
      const bandWidth = plotWidth / total;
      return padLeft + index * bandWidth + bandWidth / 2;
    }
    return padLeft + (index / (total - 1)) * plotWidth;
  };

  const subtitle = y_axis?.title || x_axis?.title;

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
          {subtitle && (
            <p className="text-xs text-[#ffffff] mt-1 font-normal">
              <RandomFontText text={subtitle} />
            </p>
          )}
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
            <TrendingUp size={15} />
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
        <div className="px-3 sm:px-5 pb-4 pt-1">
          <div className="relative w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-auto min-w-[320px] max-h-[290px]"
            >
              {/* Horizontal Grid lines and Y-axis labels */}
              {yTicks.map((tickVal, tIdx) => {
                const y = getYCoord(tickVal);
                return (
                  <g key={`ytick-${tIdx}`}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={svgWidth - padRight}
                      y2={y}
                      stroke="#000000"
                      strokeWidth={1}
                    />
                    <text
                      x={padLeft - 10}
                      y={y + 3.5}
                      textAnchor="end"
                      fill="#ffffff"
                      fontSize={11}
                      fontFamily="sans-serif"
                    >
                      {tickVal}
                    </text>
                  </g>
                );
              })}

              {/* Bar Chart rendering */}
              {style === "bar" && (
                <g>
                  {categories.map((cat, catIdx) => {
                    const bandWidth = plotWidth / categories.length;
                    const groupPadding = bandWidth * 0.24;
                    const availableWidth = bandWidth - groupPadding * 2;
                    const numSeries = series.length;
                    const barWidth = Math.max(6, availableWidth / numSeries);
                    const zeroY = getYCoord(0);
                    const isHovered = hoveredIndex === catIdx;

                    return (
                      <g
                        key={`bar-group-${catIdx}`}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredIndex(catIdx)}
                        onMouseLeave={() => setHoveredIndex(null)}
                      >
                        {/* Column hover band highlight */}
                        {isHovered && (
                          <rect
                            x={padLeft + catIdx * bandWidth}
                            y={padTop}
                            width={bandWidth}
                            height={plotHeight}
                            fill="#000000"
                            fillOpacity={0.4}
                          />
                        )}

                        {series.map((s, sIdx) => {
                          const val = s.values ? s.values[catIdx] : null;
                          if (val === null || val === undefined || isNaN(val)) return null;

                          const barX =
                            padLeft +
                            catIdx * bandWidth +
                            groupPadding +
                            sIdx * barWidth;
                          const valY = getYCoord(val);
                          const barH = Math.max(2, Math.abs(zeroY - valY));
                          const topY = val >= 0 ? valY : zeroY;
                          const color = pickSeriesColor(s.color, sIdx);

                          return (
                            <rect
                              key={`bar-${sIdx}-${catIdx}`}
                              x={barX}
                              y={topY}
                              width={Math.max(4, barWidth - (numSeries > 1 ? 2 : 0))}
                              height={barH}
                              rx={4}
                              ry={4}
                              fill={color}
                              className="transition-all duration-150"
                            />
                          );
                        })}

                        {/* X-axis category label */}
                        <text
                          x={padLeft + catIdx * bandWidth + bandWidth / 2}
                          y={svgHeight - 10}
                          textAnchor="middle"
                          fill={isHovered ? "#ffffff" : "#ffffff"}
                          fontSize={11}
                          fontFamily="sans-serif"
                        >
                          {cat}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}

              {/* Line Chart rendering */}
              {style === "line" && (
                <g>
                  {/* Category X labels */}
                  {categories.map((cat, catIdx) => {
                    const x = getXCoord(catIdx, categories.length);
                    const isHovered = hoveredIndex === catIdx;
                    return (
                      <text
                        key={`line-cat-${catIdx}`}
                        x={x}
                        y={svgHeight - 10}
                        textAnchor="middle"
                        fill={isHovered ? "#ffffff" : "#ffffff"}
                        fontSize={11}
                        fontFamily="sans-serif"
                      >
                        {cat}
                      </text>
                    );
                  })}

                  {/* Vertical dashed indicator on hover */}
                  {hoveredIndex !== null && (
                    <line
                      x1={getXCoord(hoveredIndex, categories.length)}
                      y1={padTop}
                      x2={getXCoord(hoveredIndex, categories.length)}
                      y2={padTop + plotHeight}
                      stroke="#000000"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                  )}

                  {/* Series lines and point circles */}
                  {series.map((s, sIdx) => {
                    const color = pickSeriesColor(s.color, sIdx);
                    const pts = categories
                      .map((cat, cIdx) => {
                        const val = s.values ? s.values[cIdx] : null;
                        if (val === null || val === undefined || isNaN(val)) return null;
                        return {
                          x: getXCoord(cIdx, categories.length),
                          y: getYCoord(val),
                          val,
                          cat,
                          index: cIdx,
                        };
                      })
                      .filter((p): p is { x: number; y: number; val: number; cat: string; index: number } => Boolean(p));

                    if (pts.length === 0) return null;

                    const polylinePoints = pts.map(p => `${p.x},${p.y}`).join(" ");

                    return (
                      <g key={`line-series-${sIdx}`}>
                        {/* Line path */}
                        <polyline
                          points={polylinePoints}
                          fill="none"
                          stroke={color}
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray={SERIES_DASH[sIdx % SERIES_DASH.length]}
                        />

                        {/* Point dots */}
                        {pts.map((p, pIdx) => {
                          const isHovered = hoveredIndex === p.index;
                          return (
                            <circle
                              key={`pt-${pIdx}`}
                              cx={p.x}
                              cy={p.y}
                              r={isHovered ? 5 : 4}
                              fill={color}
                              stroke="#000000"
                              strokeWidth={1.5}
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredIndex(p.index)}
                              onMouseLeave={() => setHoveredIndex(null)}
                            />
                          );
                        })}
                      </g>
                    );
                  })}

                  {/* Transparent hover capture zones across line */}
                  {categories.map((_, catIdx) => {
                    const bandWidth = plotWidth / Math.max(1, categories.length - 1);
                    const x = getXCoord(catIdx, categories.length);
                    return (
                      <rect
                        key={`hover-zone-${catIdx}`}
                        x={x - bandWidth / 2}
                        y={padTop}
                        width={bandWidth}
                        height={plotHeight}
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredIndex(catIdx)}
                        onMouseLeave={() => setHoveredIndex(null)}
                      />
                    );
                  })}
                </g>
              )}

              {/* Scatter Chart rendering */}
              {style === "scatter" && (
                <g>
                  {categories.map((cat, catIdx) => {
                    const x = getXCoord(catIdx, categories.length);
                    return (
                      <text
                        key={`scatter-cat-${catIdx}`}
                        x={x}
                        y={svgHeight - 10}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize={11}
                        fontFamily="sans-serif"
                      >
                        {cat}
                      </text>
                    );
                  })}

                  {series.map((s, sIdx) => {
                    const color = pickSeriesColor(s.color, sIdx);
                    const pts = (s.points || []).map((p, pIdx) => ({
                      x: getXCoord(pIdx, (s.points || []).length),
                      y: getYCoord(p.y),
                      origX: p.x,
                      origY: p.y,
                      index: pIdx,
                    }));

                    return (
                      <g key={`scatter-series-${sIdx}`}>
                        {pts.map((p, pIdx) => (
                          <circle
                            key={`spt-${pIdx}`}
                            cx={p.x}
                            cy={p.y}
                            r={4.5}
                            fill={color}
                            stroke="#ffffff"
                            strokeWidth={1.5}
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredIndex(p.index)}
                            onMouseLeave={() => setHoveredIndex(null)}
                          />
                        ))}
                      </g>
                    );
                  })}
                </g>
              )}
            </svg>

            {/* Floating Tooltip Box matching reference images */}
            {hoveredIndex !== null && categories[hoveredIndex] && (
              <div
                className="absolute z-20 pointer-events-none bg-[#000000] border border-[#000000] rounded-lg shadow-2xl p-2.5 min-w-[140px] text-xs font-sans transition-all duration-100"
                style={{
                  top: "20px",
                  left: `${Math.min(
                    Math.max(10, ((getXCoord(hoveredIndex, categories.length) + 16) / svgWidth) * 100),
                    70
                  )}%`,
                }}
              >
                <div className="text-[#ffffff] font-medium mb-1">
                  {categories[hoveredIndex]}
                </div>
                <div className="space-y-1">
                  {series.map((s, sIdx) => {
                    const val = s.values ? s.values[hoveredIndex] : s.points ? s.points[hoveredIndex]?.y : null;
                    if (val === null || val === undefined || isNaN(val)) return null;
                    const color = pickSeriesColor(s.color, sIdx);
                    const seriesLabel = s.name || subtitle || "Value";

                    return (
                      <div key={`tip-${sIdx}`} className="flex items-center space-x-1.5 whitespace-nowrap">
                        {style === "bar" ? (
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: color }}
                          />
                        ) : (
                          <span
                            className="inline-block w-3 h-0.5 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                        )}
                        <span className="font-bold text-white">{val}</span>
                        <span className="text-[#ffffff] truncate">{seriesLabel}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Series Legend below chart */}
          {series.length > 0 && (series.length > 1 || series[0].name) && (
            <div className="flex flex-wrap items-center justify-start gap-4 mt-1 pt-2 border-t border-[#000000] text-xs">
              {series.map((s, idx) => {
                const color = s.color || PALETTE[idx % PALETTE.length];
                return (
                  <div key={`legend-${idx}`} className="flex items-center space-x-1.5 text-[#ffffff]">
                    {style === "bar" ? (
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: color }}
                      />
                    ) : (
                      <span
                        className="inline-block w-3 h-0.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    )}
                    <span>{s.name || `Series ${idx + 1}`}</span>
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
                  <th className="py-2.5 pr-4 font-normal text-[#ffffff]">
                    Category
                  </th>
                  {series.map((s, i) => (
                    <th key={`th-${i}`} className="py-2.5 pr-4 font-normal text-[#ffffff]">
                      {s.name || (subtitle ? `${subtitle}` : `Series ${i + 1}`)}
                      {subtitle && !s.name ? "" : subtitle ? ` (${subtitle})` : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#000000]">
                {categories.map((cat, rowIdx) => (
                  <tr key={`row-${rowIdx}`} className="hover:bg-[#000000] transition-colors">
                    <td className="py-3 pr-4 text-white font-medium">{cat}</td>
                    {series.map((s, sIdx) => {
                      const val = s.values ? s.values[rowIdx] : s.points ? s.points[rowIdx]?.y : "-";
                      return (
                        <td key={`cell-${rowIdx}-${sIdx}`} className="py-3 pr-4 text-[#ffffff]">
                          {val !== null && val !== undefined ? String(val) : "-"}
                        </td>
                      );
                    })}
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
