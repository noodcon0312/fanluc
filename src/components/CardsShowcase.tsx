import React, { useState } from "react";
import { WeatherCard } from "./WeatherCard";
import { TranslationCard } from "./TranslationCard";
import { MapEmbedCard } from "./MapEmbedCard";
import { StepGuideCard } from "./StepGuideCard";
import { TabCard } from "./TabCard";
import { ChartDisplayCard } from "./ChartDisplayCard";
import { PieChartDisplayCard } from "./PieChartDisplayCard";
import { FileArtifactCard } from "./FileArtifactCard";
import { VirtualFile } from "../types";
import { Download, Code, Check } from "lucide-react";
import { RandomFontText } from "../utils/randomFont";
import { exportWeatherCardTsx, exportWeatherCardHtml, copyWeatherCardSource } from "../utils/exportWeatherCard";

export const CardsShowcase: React.FC<{
  onOpenArtifact?: (file: VirtualFile) => void;
}> = ({ onOpenArtifact }) => {
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [copiedWeatherCode, setCopiedWeatherCode] = useState(false);

  const handleCopyWeather = async () => {
    const ok = await copyWeatherCardSource();
    if (ok) {
      setCopiedWeatherCode(true);
      setTimeout(() => setCopiedWeatherCode(false), 2000);
    }
  };

  const sampleFiles: VirtualFile[] = [
    {
      path: "src/analytics/engine.py",
      name: "engine.py",
      language: "python",
      size: 1420,
      updatedAt: Date.now(),
      content: `def compute_performance_metrics(history):\n    total_tokens = sum(m.get('tokens', 0) for m in history)\n    return {"total_tokens": total_tokens, "status": "active"}`
    },
    {
      path: "public/dashboard.html",
      name: "dashboard.html",
      language: "html",
      size: 2890,
      updatedAt: Date.now(),
      content: `<!DOCTYPE html>\n<html>\n<head><title>Telemetry</title></head>\n<body><h1>Real-time Status</h1></body>\n</html>`
    }
  ];

  return (
    <div className="space-y-6 font-mono text-black dark:text-white">
      {/* Category Filter bar */}
      <div className="flex flex-wrap items-center gap-1.5 p-2 border border-black dark:border-white bg-black/5 dark:bg-white/5 text-xs">
        <span className="font-bold mr-2 uppercase text-[11px] opacity-70">[FILTER_CARDS]:</span>
        {["all", "weather", "charts", "maps", "guides", "tabs", "translation", "files"].map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            className={`px-2.5 py-1 uppercase text-[11px] font-bold border transition-colors ${
              activeFilter === cat
                ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white"
                : "border-black/30 dark:border-white/30 hover:border-black dark:hover:border-white"
            }`}
          >
            {`[${cat.toUpperCase()}]`}
          </button>
        ))}
      </div>

      {/* 1. WEATHER CARDS SHOWCASE */}
      {(activeFilter === "all" || activeFilter === "weather") && (
        <div className="border border-black dark:border-white p-4 bg-white dark:bg-black">
          <div className="border-b border-black/20 dark:border-white/20 pb-3 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider block">
                [WEATHER_CARDS] (7 Flat Illustration Themes)
              </span>
              <span className="text-[10px] opacity-60">Export component source to edit & send back</span>
            </div>
            
            {/* Export Toolbar for User */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={exportWeatherCardTsx}
                className="px-2.5 py-1 bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white text-[11px] font-bold uppercase flex items-center space-x-1.5 hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-colors"
                title="Download WeatherCard.tsx component"
              >
                <Download size={12} />
                <span>DOWNLOAD .TSX</span>
              </button>

              <button
                type="button"
                onClick={exportWeatherCardHtml}
                className="px-2.5 py-1 border border-black dark:border-white text-[11px] font-bold uppercase flex items-center space-x-1.5 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                title="Download standalone HTML file with CSS & SVG"
              >
                <Code size={12} />
                <span>DOWNLOAD HTML</span>
              </button>

              <button
                type="button"
                onClick={handleCopyWeather}
                className="px-2.5 py-1 border border-black dark:border-white text-[11px] font-bold uppercase hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                title="Copy WeatherCard component source code"
              >
                <RandomFontText text={copiedWeatherCode ? "[COPIED SOURCE]" : "[COPY SOURCE]"} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 justify-start items-start">
            <WeatherCard
              data={{
                location: "Tokyo, Japan",
                temperature: 23,
                condition: "Sunny",
                time: "09:30",
                date: "Mon.Mar 26",
              }}
            />
            <WeatherCard
              data={{
                location: "London, UK",
                temperature: 18,
                condition: "Cloudy",
                time: "14:10",
                date: "Mon.Mar 26",
              }}
            />
            <WeatherCard
              data={{
                location: "Amsterdam, Netherlands",
                temperature: 14,
                condition: "Windy",
                time: "16:15",
                date: "Mon.Mar 26",
              }}
            />
            <WeatherCard
              data={{
                location: "San Francisco, USA",
                temperature: 20,
                condition: "Fog",
                time: "10:20",
                date: "Mon.Mar 26",
              }}
            />
            <WeatherCard
              data={{
                location: "Oslo, Norway",
                temperature: -3,
                condition: "Snow",
                time: "11:30",
                date: "Fri.Dec 15",
              }}
            />
            <WeatherCard
              data={{
                location: "Hanoi, Vietnam",
                temperature: 12,
                condition: "Rainy",
                time: "19:40",
                date: "Mon.Mar 26",
              }}
            />
            <WeatherCard
              data={{
                location: "Singapore",
                temperature: 29,
                condition: "Stormy",
                time: "21:15",
                date: "Wed.Apr 04",
              }}
            />
          </div>
        </div>
      )}

      {/* 2. CHARTS SHOWCASE */}
      {(activeFilter === "all" || activeFilter === "charts") && (
        <div className="border border-black dark:border-white p-4 bg-white dark:bg-black space-y-4">
          <div className="border-b border-black/20 dark:border-white/20 pb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider">
              [ANALYTICAL_CHARTS] (Line, Bar, Donut & Pie)
            </span>
            <span className="text-[10px] opacity-60">Interactive Visualizer</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Line Chart */}
            <ChartDisplayCard
              data={{
                title: "Server Throughput (Requests/sec)",
                style: "line",
                x_axis: { data: ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"], title: "Timestamp" },
                y_axis: { title: "req/s" },
                series: [
                  { name: "Primary Node", values: [120, 190, 480, 720, 650, 410], color: "#ffffff" },
                  { name: "Secondary Node", values: [80, 110, 310, 540, 490, 290], color: "#ffffff" },
                ],
              }}
            />

            {/* Bar Chart */}
            <ChartDisplayCard
              data={{
                title: "Daily Token Ingestion by Module",
                style: "bar",
                x_axis: { data: ["Mon", "Tue", "Wed", "Thu", "Fri"], title: "Day" },
                series: [
                  { name: "Search & Fetch", values: [15000, 23000, 18000, 29000, 31000], color: "#ffffff" },
                  { name: "File System", values: [8000, 12000, 9500, 14000, 16000], color: "#ffffff" },
                ],
              }}
            />

            {/* Donut Chart */}
            <PieChartDisplayCard
              data={{
                title: "Memory Distribution Breakdown",
                style: "donut",
                unit: "MB",
                show_percentages: true,
                show_legend: true,
                slices: [
                  { label: "Vector Embeddings", value: 450, color: "#ffffff" },
                  { label: "Session Buffer", value: 280, color: "#ffffff" },
                  { label: "V8 Heap Cache", value: 310, color: "#ffffff" },
                  { label: "Virtual Filesystem", value: 160, color: "#ffffff" },
                ],
              }}
            />

            {/* Pie Chart */}
            <PieChartDisplayCard
              data={{
                title: "Tool Calls Frequency Share",
                style: "pie",
                show_percentages: true,
                show_legend: true,
                slices: [
                  { label: "Yahoo Search", value: 45, color: "#ffffff" },
                  { label: "Weather Radar", value: 25, color: "#ffffff" },
                  { label: "Code Executor", value: 20, color: "#ffffff" },
                  { label: "File FS", value: 10, color: "#ffffff" },
                ],
              }}
            />
          </div>
        </div>
      )}

      {/* 3. TRANSLATION & MAP CARDS */}
      {(activeFilter === "all" || activeFilter === "translation" || activeFilter === "maps") && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(activeFilter === "all" || activeFilter === "translation") && (
            <div className="border border-black dark:border-white p-4 bg-white dark:bg-black">
              <div className="border-b border-black/20 dark:border-white/20 pb-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider">[TRANSLATION_CARD]</span>
              </div>
              <TranslationCard
                data={{
                  originalText: "Hello, welcome to the developer terminal diagnostic console.",
                  translatedText: "こんにちは、開発者用ターミナル診断コンソールへようこそ。",
                  fromLang: "en",
                  toLang: "ja",
                  title: "Diagnostic Greeting Translation",
                }}
              />
            </div>
          )}

          {(activeFilter === "all" || activeFilter === "maps") && (
            <div className="border border-black dark:border-white p-4 bg-white dark:bg-black">
              <div className="border-b border-black/20 dark:border-white/20 pb-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider">[MAP_EMBED_CARD]</span>
              </div>
              <MapEmbedCard
                places={[
                  { name: "Hoan Kiem Lake, Hanoi" },
                  { name: "Tokyo Tower, Minato City, Tokyo" },
                  { name: "Eiffel Tower, Paris" },
                ]}
                title="Monitored Geo Landmarks"
              />
            </div>
          )}
        </div>
      )}

      {/* 4. STEP GUIDE & TAB CARDS */}
      {(activeFilter === "all" || activeFilter === "guides" || activeFilter === "tabs") && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(activeFilter === "all" || activeFilter === "guides") && (
            <div className="border border-black dark:border-white p-4 bg-white dark:bg-black">
              <div className="border-b border-black/20 dark:border-white/20 pb-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider">[STEP_GUIDE_CARD]</span>
              </div>
              <StepGuideCard
                steps={[
                  "Inspect active API configuration in settings modal.",
                  "Initialize mock data payloads and verify terminal status.",
                  "Execute performance diagnostics to measure latency.",
                  "Deploy the tested bundle to staging container.",
                ]}
              />
            </div>
          )}

          {(activeFilter === "all" || activeFilter === "tabs") && (
            <div className="border border-black dark:border-white p-4 bg-white dark:bg-black">
              <div className="border-b border-black/20 dark:border-white/20 pb-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider">[TAB_CARD] (Interactive Mode)</span>
              </div>
              <TabCard
                data={{
                  mode: "copy",
                  tabs: [
                    {
                      title: "V1 Endpoint",
                      content: `POST /v1/chat/completions\nContent-Type: application/json\n\n{\n  "model": "gpt-4o",\n  "stream": true\n}`,
                    },
                    {
                      title: "Headers Config",
                      content: `Authorization: Bearer <API_KEY>\nAccept: text/event-stream\nCache-Control: no-cache`,
                    },
                    {
                      title: "Telemetry Hook",
                      content: `const onTokenChunk = (tok) => recordLatency(tok);`,
                    },
                  ],
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* 5. FILE ARTIFACT CARD */}
      {(activeFilter === "all" || activeFilter === "files") && (
        <div className="border border-black dark:border-white p-4 bg-white dark:bg-black">
          <div className="border-b border-black/20 dark:border-white/20 pb-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider">[FILE_ARTIFACT_CARD]</span>
          </div>
          <FileArtifactCard
            files={sampleFiles}
            onOpenArtifact={onOpenArtifact || (() => {})}
          />
        </div>
      )}
    </div>
  );
};
