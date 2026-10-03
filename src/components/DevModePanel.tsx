import React, { useState } from "react";
import { ApiConfig, ChatSession, VirtualFile } from "../types";
import { computeSessionMetrics } from "../utils/tokenCounter";
import { CardsShowcase } from "./CardsShowcase";
import { ROLE_USER_PROMPT } from "../prompts";
import { Copy, Check, Terminal, Cpu, Eye, UserCheck, LayoutGrid, ArrowLeft } from "lucide-react";
import { RandomFontText } from "../utils/randomFont";

interface Props {
  config: ApiConfig;
  session?: ChatSession;
  activeSystemPrompt: string;
  isPerfMonitorEnabled: boolean;
  onTogglePerfMonitor: () => void;
  isRawViewEnabled: boolean;
  onToggleRawView: () => void;
  isAiRoleSimEnabled: boolean;
  onToggleAiRoleSim: () => void;
  isSeeAllCardEnabled: boolean;
  onToggleSeeAllCard: () => void;
  lastRawRequest?: any;
  lastRawResponse?: string;
  onClose: () => void;
  onOpenArtifact?: (file: VirtualFile) => void;
  onSendAsUser?: (text: string) => void;
}

export const DevModePanel: React.FC<Props> = ({
  config,
  session,
  activeSystemPrompt,
  isPerfMonitorEnabled,
  onTogglePerfMonitor,
  isRawViewEnabled,
  onToggleRawView,
  isAiRoleSimEnabled,
  onToggleAiRoleSim,
  isSeeAllCardEnabled,
  onToggleSeeAllCard,
  lastRawRequest,
  lastRawResponse,
  onClose,
  onOpenArtifact,
  onSendAsUser,
}) => {
  const [activeTab, setActiveTab] = useState<"diagnostics" | "raw" | "help" | "cards">(
    isSeeAllCardEnabled ? "cards" : "diagnostics"
  );
  const [copiedRequest, setCopiedRequest] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [copiedHelp, setCopiedHelp] = useState(false);

  const metrics = computeSessionMetrics(session, activeSystemPrompt);

  const copyToClipboard = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 1500);
  };

  const helpCommandsList = [
    {
      name: "list_skills",
      syntax: 'list_skills',
      desc: "Returns short summaries of all available skills, tags, and workflow descriptions.",
      example: 'list_skills',
    },
    {
      name: "load_skills",
      syntax: 'load_skills("id1", "id2", ...)',
      desc: "Loads the full content and guidelines of one or more skills by id.",
      example: 'load_skills("applet-seo", "pwa-integration")',
    },
    {
      name: "search",
      syntax: 'search("query")(count)',
      desc: "Perform web search via Yahoo engine with real-time scraping.",
      example: 'search("latest react 19 features")(5)',
    },
    {
      name: "fetch",
      syntax: 'fetch("https://...")(length)',
      desc: "Retrieve and read raw text from any public HTTP/HTTPS URL up to length chars.",
      example: 'fetch("https://news.ycombinator.com")(1100)',
    },
    {
      name: "run_cmd",
      syntax: 'run_cmd{ shell command here }',
      desc: "Execute a real shell command directly on your own machine, in the workspace folder you picked (no sandbox).",
      example: 'run_cmd{ python3 -c "import math; print(math.pi * 4)" }',
    },
    {
      name: "show_weather",
      syntax: 'show_weather(location="auto" | "City Name")',
      desc: "Fetch live Open-Meteo forecast and render 7-theme flat illustration card.",
      example: 'show_weather(location="Tokyo")',
    },
    {
      name: "show_map",
      syntax: 'show_map(places=[{"name": "Location 1"}, ...])',
      desc: "Display interactive map landmarks and direct Google Maps navigation links.",
      example: 'show_map(places=[{"name": "Hoan Kiem Lake, Hanoi"}])',
    },
    {
      name: "translate",
      syntax: 'translate(text="...", from="auto", to="vi"|"en"|"ja")',
      desc: "Translate multi-language text with bilingual TTS audio card.",
      example: 'translate(text="Good morning", from="en", to="vi")',
    },
    {
      name: "write_file",
      syntax: 'write_file(path="path/to/file.ext", content="...")',
      desc: "Create or overwrite virtual file in session filesystem.",
      example: 'write_file(path="src/index.ts", content="console.log(42);")',
    },
    {
      name: "read_file",
      syntax: 'read_file(path="path/to/file.ext")',
      desc: "Read contents of existing virtual file in current session.",
      example: 'read_file(path="src/index.ts")',
    },
    {
      name: "chart",
      syntax: 'chart(title="...", style="line"|"bar", series=[...])',
      desc: "Render inline native Recharts visualization.",
      example: 'chart(title="Latency", style="line", series=[{"name": "ms", "values": [12, 18, 9, 25]}])',
    },
    {
      name: "pie_chart",
      syntax: 'pie_chart(title="...", style="donut"|"pie", slices=[...])',
      desc: "Render inline native Pie / Donut slice chart.",
      example: 'pie_chart(title="Share", style="donut", slices=[{"label": "A", "value": 60}, {"label": "B", "value": 40}])',
    },
    {
      name: "tab_card",
      syntax: 'tab_card(mode="copy"|"none", tabs=[{"title": "T1", "content": "C1"}])',
      desc: "Render interactive multi-tab component with copy options.",
      example: 'tab_card(mode="copy", tabs=[{"title": "Config", "content": "DEBUG=true"}])',
    },
    {
      name: "step_guide",
      syntax: 'step_guide(steps=["Step 1", "Step 2", "Step 3"])',
      desc: "Render sequential interactive checklist workflow.",
      example: 'step_guide(steps=["Clone repo", "Run npm install", "Start dev server"])',
    },
  ];

  return (
    <div className="w-full flex-1 flex flex-col bg-black text-white font-mono min-h-screen select-text">
      {/* Top Terminal Bar */}
      <div className="border-b-2 border-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-black">
        <div className="flex items-center space-x-3">
          <Terminal className="w-5 h-5 text-white" />
          <span className="font-bold text-sm tracking-wider uppercase">
            <RandomFontText text="[DEV_MODE CONSOLE] :: DIAGNOSTIC & SIMULATOR v1.0.4" />
          </span>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="opacity-60 hidden md:inline">
            SESSION: {session?.title || "DEFAULT"} ({session?.messages.length || 0} msgs)
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-white text-black font-bold uppercase text-xs hover:bg-black hover:text-white border border-white transition-colors flex items-center space-x-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <RandomFontText text="[BACK_TO_CHAT]" />
          </button>
        </div>
      </div>

      {/* Switch Control Grid */}
      <div className="p-4 border-b-2 border-white bg-white/5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Switch 1: Performance */}
        <div
          onClick={onTogglePerfMonitor}
          className={`cursor-pointer border p-3 flex flex-col justify-between transition-colors ${
            isPerfMonitorEnabled
              ? "border-white bg-white text-black"
              : "border-white/40 bg-black text-white hover:bg-white/10 hover:border-white"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4" />
              <span className="font-bold text-xs uppercase"><RandomFontText text="[PERF_MONITOR]" /></span>
            </div>
            <span className="text-[10px] font-bold px-1.5 py-0.5 border border-current">
              {isPerfMonitorEnabled ? "ON" : "OFF"}
            </span>
          </div>
          <p className="text-[11px] opacity-80 leading-snug">
            Real-time telemetry: total tokens, throughput (tok/s), toolcall count, system tokens.
          </p>
        </div>

        {/* Switch 2: Raw View */}
        <div
          onClick={onToggleRawView}
          className={`cursor-pointer border p-3 flex flex-col justify-between transition-colors ${
            isRawViewEnabled
              ? "border-white bg-white text-black"
              : "border-white/40 bg-black text-white hover:bg-white/10 hover:border-white"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Eye className="w-4 h-4" />
              <span className="font-bold text-xs uppercase"><RandomFontText text="[VIEW_RAW]" /></span>
            </div>
            <span className="text-[10px] font-bold px-1.5 py-0.5 border border-current">
              {isRawViewEnabled ? "ON" : "OFF"}
            </span>
          </div>
          <p className="text-[11px] opacity-80 leading-snug">
            Unhide all system tags, raw payload structures, tool parameters, and raw JSON exchanges.
          </p>
        </div>

        {/* Switch 3: AI Role Simulator */}
        <div
          onClick={onToggleAiRoleSim}
          className={`cursor-pointer border p-3 flex flex-col justify-between transition-colors ${
            isAiRoleSimEnabled
              ? "border-white bg-white text-black"
              : "border-white/40 bg-black text-white hover:bg-white/10 hover:border-white"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <UserCheck className="w-4 h-4" />
              <span className="font-bold text-xs uppercase"><RandomFontText text="[ROLE_SIMULATOR]" /></span>
            </div>
            <span className="text-[10px] font-bold px-1.5 py-0.5 border border-current">
              {isAiRoleSimEnabled ? "ON" : "OFF"}
            </span>
          </div>
          <p className="text-[11px] opacity-80 leading-snug">
            AI becomes the User giving problems. User acts as Assistant with full AI tool execution & /help.
          </p>
        </div>

        {/* Switch 4: See All Cards */}
        <div
          onClick={() => {
            onToggleSeeAllCard();
            if (!isSeeAllCardEnabled) setActiveTab("cards");
          }}
          className={`cursor-pointer border p-3 flex flex-col justify-between transition-colors ${
            isSeeAllCardEnabled
              ? "border-white bg-white text-black"
              : "border-white/40 bg-black text-white hover:bg-white/10 hover:border-white"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <LayoutGrid className="w-4 h-4" />
              <span className="font-bold text-xs uppercase"><RandomFontText text="[SEE_ALL_CARDS]" /></span>
            </div>
            <span className="text-[10px] font-bold px-1.5 py-0.5 border border-current">
              {isSeeAllCardEnabled ? "ON" : "OFF"}
            </span>
          </div>
          <p className="text-[11px] opacity-80 leading-snug">
            Directly render & test all native UI cards (Weather 7-themes, Charts, Maps, Translations).
          </p>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="border-b border-white px-4 flex flex-wrap gap-2 bg-black py-2">
        <button
          onClick={() => setActiveTab("diagnostics")}
          className={`px-3 py-1 text-xs font-bold uppercase border transition-colors ${
            activeTab === "diagnostics"
              ? "bg-white text-black border-white"
              : "bg-transparent text-white border-white/30 hover:bg-white hover:text-black hover:border-white"
          }`}
        >
          <RandomFontText text="[1. PERFORMANCE TELEMETRY]" />
        </button>

        <button
          onClick={() => setActiveTab("raw")}
          className={`px-3 py-1 text-xs font-bold uppercase border transition-colors ${
            activeTab === "raw"
              ? "bg-white text-black border-white"
              : "bg-transparent text-white border-white/30 hover:bg-white hover:text-black hover:border-white"
          }`}
        >
          <RandomFontText text="[2. RAW PAYLOAD INSPECTOR]" />
        </button>

        <button
          onClick={() => setActiveTab("help")}
          className={`px-3 py-1 text-xs font-bold uppercase border transition-colors ${
            activeTab === "help"
              ? "bg-white text-black border-white"
              : "bg-transparent text-white border-white/30 hover:bg-white hover:text-black hover:border-white"
          }`}
        >
          <RandomFontText text="[3. TOOL COMMANDS GUIDE (/help)]" />
        </button>

        <button
          onClick={() => setActiveTab("cards")}
          className={`px-3 py-1 text-xs font-bold uppercase border transition-colors ${
            activeTab === "cards"
              ? "bg-white text-black border-white"
              : "bg-transparent text-white border-white/30 hover:bg-white hover:text-black hover:border-white"
          }`}
        >
          <RandomFontText text="[4. ALL CARDS SHOWCASE]" />
        </button>
      </div>

      {/* Main Terminal Viewport */}
      <div className="flex-1 p-4 overflow-y-auto max-w-7xl w-full mx-auto space-y-6">
        {/* TAB 1: DIAGNOSTICS & PERFORMANCE */}
        {activeTab === "diagnostics" && (
          <div className="space-y-6">
            <div className="border border-white p-4 bg-black space-y-4">
              <div className="border-b border-white/30 pb-2 flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider">
                  === SESSION PERFORMANCE & TOKEN TELEMETRY ===
                </span>
                <span className="text-[11px] opacity-70">STATUS: ACTIVE RECORDING</span>
              </div>

              {/* 4 Core Metrics requested by User */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Tokens in Conversation */}
                <div className="border border-white p-3 bg-white/5 space-y-1">
                  <div className="text-[11px] opacity-60 uppercase">[TOTAL_CONVERSATION_TOKENS]</div>
                  <div className="text-2xl font-bold tracking-tight">{metrics.totalTokens.toLocaleString()}</div>
                  <div className="text-[10px] opacity-70 flex justify-between border-t border-white/20 pt-1">
                    <span>Prompt: {metrics.promptTokens.toLocaleString()}</span>
                    <span>Output: {metrics.completionTokens.toLocaleString()}</span>
                  </div>
                </div>

                {/* 2. Avg Output Tokens/sec */}
                <div className="border border-white p-3 bg-white/5 space-y-1">
                  <div className="text-[11px] opacity-60 uppercase">[THROUGHPUT_SPEED]</div>
                  <div className="text-2xl font-bold tracking-tight">
                    {metrics.avgTokensPerSec > 0 ? `${metrics.avgTokensPerSec} tok/s` : "STANDBY"}
                  </div>
                  <div className="text-[10px] opacity-70 border-t border-white/20 pt-1">
                    Average generation speed across assistant turns
                  </div>
                </div>

                {/* 3. Total Tool Calls */}
                <div className="border border-white p-3 bg-white/5 space-y-1">
                  <div className="text-[11px] opacity-60 uppercase">[TOTAL_TOOLCALLS]</div>
                  <div className="text-2xl font-bold tracking-tight">{metrics.totalToolCalls}</div>
                  <div className="text-[10px] opacity-70 border-t border-white/20 pt-1">
                    Executed search, fetch, weather, map, file & code tools
                  </div>
                </div>

                {/* 4. Total System Instructions Tokens */}
                <div className="border border-white p-3 bg-white/5 space-y-1">
                  <div className="text-[11px] opacity-60 uppercase">[SYSTEM_PROMPT_TOKENS]</div>
                  <div className="text-2xl font-bold tracking-tight">
                    {metrics.systemInstructionTokens.toLocaleString()}
                  </div>
                  <div className="text-[10px] opacity-70 border-t border-white/20 pt-1">
                    Active System Prompt ({isAiRoleSimEnabled ? "ROLE_USER" : config.effort || "fast"})
                  </div>
                </div>
              </div>

              {/* Tool Calls Breakdown Matrix */}
              <div className="border border-white/30 p-3 bg-white/5 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider block border-b border-white/20 pb-1">
                  [TOOL_CALLS_BREAKDOWN_MATRIX]:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="flex justify-between border-b border-white/10 py-1">
                    <span>Search (Yahoo):</span>
                    <span className="font-bold">{metrics.toolCallsBreakdown.search || 0}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/10 py-1">
                    <span>Fetch (Scrape URL):</span>
                    <span className="font-bold">{metrics.toolCallsBreakdown.fetch || 0}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/10 py-1">
                    <span>Weather (Open-Meteo):</span>
                    <span className="font-bold">{metrics.toolCallsBreakdown.weather || 0}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/10 py-1">
                    <span>Maps (Landmarks):</span>
                    <span className="font-bold">{metrics.toolCallsBreakdown.map || 0}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/10 py-1">
                    <span>Translations:</span>
                    <span className="font-bold">{metrics.toolCallsBreakdown.translate || 0}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/10 py-1">
                    <span>File System (FS):</span>
                    <span className="font-bold">{metrics.toolCallsBreakdown.files || 0}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/10 py-1">
                    <span>Code Execution (JS/Py):</span>
                    <span className="font-bold">{metrics.toolCallsBreakdown.code_exec || 0}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/10 py-1">
                    <span>Active Virtual Files:</span>
                    <span className="font-bold">{Object.keys(session?.files || {}).length}</span>
                  </div>
                </div>
              </div>

              {/* Active System Prompt Breakdown */}
              <div className="border border-white/30 p-3 bg-white/5 space-y-2">
                <div className="flex items-center justify-between border-b border-white/20 pb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    [ACTIVE_SYSTEM_PROMPT_PREVIEW]
                  </span>
                  <span className="text-[10px] opacity-70">
                    {metrics.systemInstructionTokens} tokens | {activeSystemPrompt.length} chars
                  </span>
                </div>
                <pre className="p-3 bg-black border border-white/20 text-xs font-mono whitespace-pre-wrap max-h-44 overflow-y-auto opacity-90">
                  {activeSystemPrompt || "[NO_SYSTEM_PROMPT_CONFIGURED]"}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: RAW PAYLOAD INSPECTOR */}
        {activeTab === "raw" && (
          <div className="space-y-6">
            <div className="border border-white p-4 bg-black space-y-4">
              <div className="border-b border-white/30 pb-2 flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider">
                  === RAW API PAYLOAD & RESPONSE STREAM INSPECTOR ===
                </span>
                <span className="text-[11px] opacity-70">
                  RAW_MODE: {isRawViewEnabled ? "ENABLED" : "DISABLED"}
                </span>
              </div>

              <div className="text-xs opacity-80 leading-relaxed border border-white/20 p-2.5 bg-white/5">
                When View Raw is enabled, chat view will no longer strip &lt;think&gt; tags, intermediate tool logs
                [SEARCHING_YAHOO:...], or weather/map functions. Below you can inspect the exact payload exchanged
                with the backend endpoint.
              </div>

              {/* 1. Last API Request JSON */}
              <div className="border border-white/30 p-3 bg-white/5 space-y-2">
                <div className="flex items-center justify-between border-b border-white/20 pb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    [1. LAST_OUTGOING_API_REQUEST_JSON]
                  </span>
                  {lastRawRequest && (
                    <button
                      onClick={() =>
                        copyToClipboard(JSON.stringify(lastRawRequest, null, 2), setCopiedRequest)
                      }
                      className="px-2 py-0.5 text-[10px] font-bold uppercase border border-white hover:bg-white hover:text-black transition-colors"
                    >
                      <RandomFontText text={copiedRequest ? "[COPIED]" : "[COPY_JSON]"} />
                    </button>
                  )}
                </div>
                <pre className="p-3 bg-black border border-white/20 text-[11px] font-mono whitespace-pre-wrap max-h-60 overflow-y-auto opacity-90">
                  {lastRawRequest
                    ? JSON.stringify(lastRawRequest, null, 2)
                    : "// No outgoing request recorded yet in this session."}
                </pre>
              </div>

              {/* 2. Last Raw AI Response */}
              <div className="border border-white/30 p-3 bg-white/5 space-y-2">
                <div className="flex items-center justify-between border-b border-white/20 pb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    [2. LAST_INCOMING_RAW_AI_OUTPUT]
                  </span>
                  {lastRawResponse && (
                    <button
                      onClick={() => copyToClipboard(lastRawResponse, setCopiedResponse)}
                      className="px-2 py-0.5 text-[10px] font-bold uppercase border border-white hover:bg-white hover:text-black transition-colors"
                    >
                      <RandomFontText text={copiedResponse ? "[COPIED]" : "[COPY_RAW]"} />
                    </button>
                  )}
                </div>
                <pre className="p-3 bg-black border border-white/20 text-[11px] font-mono whitespace-pre-wrap max-h-60 overflow-y-auto opacity-90">
                  {lastRawResponse || "// No incoming response recorded yet in this session."}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TOOL COMMANDS GUIDE (/help) & ROLE SIMULATOR */}
        {activeTab === "help" && (
          <div className="space-y-6">
            <div className="border border-white p-4 bg-black space-y-4">
              <div className="border-b border-white/30 pb-2 flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider">
                  === AI ROLE SIMULATOR & TOOL COMMANDS MANUAL (/help) ===
                </span>
                <span className="text-[11px] opacity-70">
                  ROLE_SIM: {isAiRoleSimEnabled ? "ACTIVE (USER IS ASSISTANT)" : "INACTIVE"}
                </span>
              </div>

              {/* Inversion Simulator Notice */}
              <div className="border border-white/40 p-3 bg-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase">[SYSTEM_PROMPT_IN_EFFECT]:</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-white text-black font-bold">
                    {isAiRoleSimEnabled ? "roleUser.ts" : "EFFORT_PROMPT"}
                  </span>
                </div>
                <div className="p-2.5 bg-black border border-white/20 text-xs text-white/90">
                  <code>{ROLE_USER_PROMPT}</code>
                </div>
                <p className="text-[11px] opacity-75">
                  When enabled, the AI poses questions and gives code exercises to you. You can type tool
                  commands directly into chat or use <code>/help</code> in chat at any time.
                </p>
              </div>

              {/* Command List Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-white/20 pb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    [AVAILABLE_TOOL_COMMANDS ({helpCommandsList.length})]:
                  </span>
                  <button
                    onClick={() => {
                      const allHelp = helpCommandsList
                        .map((c) => `COMMAND: ${c.name}\nSYNTAX:  ${c.syntax}\nDESC:    ${c.desc}\nEXAMPLE: ${c.example}\n`)
                        .join("\n----------------------------------------\n");
                      copyToClipboard(allHelp, setCopiedHelp);
                    }}
                    className="px-2 py-0.5 text-[10px] font-bold uppercase border border-white hover:bg-white hover:text-black transition-colors"
                  >
                    <RandomFontText text={copiedHelp ? "[COPIED_ALL]" : "[COPY_ALL_COMMANDS]"} />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {helpCommandsList.map((cmd) => (
                    <div key={cmd.name} className="border border-white/30 p-3 bg-white/5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white uppercase">{cmd.name}</span>
                        {onSendAsUser && (
                          <button
                            onClick={() => {
                              onSendAsUser(cmd.example);
                              onClose();
                            }}
                            className="text-[10px] font-bold uppercase px-2 py-0.5 border border-white/50 hover:bg-white hover:text-black transition-colors"
                          >
                            [EXECUTE_EXAMPLE]
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-white/70">{cmd.desc}</div>
                      <div className="p-1.5 bg-black border border-white/20 text-[11px] text-white font-mono">
                        <code>{cmd.syntax}</code>
                      </div>
                      <div className="text-[10px] text-white/50">Example: {cmd.example}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ALL CARDS SHOWCASE */}
        {activeTab === "cards" && (
          <div className="space-y-4">
            <div className="border border-white p-4 bg-black">
              <div className="border-b border-white/30 pb-2 mb-4 flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider">
                  === ALL NATIVE APP CARDS INTERACTIVE SHOWCASE ===
                </span>
                <span className="text-[11px] opacity-70">DIRECT VISUAL INSPECTOR</span>
              </div>
              <CardsShowcase onOpenArtifact={onOpenArtifact} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
