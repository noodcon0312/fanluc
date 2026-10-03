import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import path from "path";
import fs from "fs";
import { sendChatMessage } from "../utils/api.js";
import { parseThinkContent } from "../utils/parseThink.js";
import { stripMcpCalls, getMcpToolsPrompt, addMcpServer, fetchMcpStatus, toggleMcp, reconnectMcp } from "../utils/mcpHelper.js";
import { stripRunCodeCommands, executeRunCmd } from "../utils/codeRunner.js";
import { cleanAiCommands } from "../utils/yahooSearch.js";
import { getSearxngUrl, setSearxngUrl } from "../utils/userConfig.js";
import { buildCompactSummaryPayload, formatCompactedMessage, MIN_MESSAGES_TO_COMPACT } from "../utils/compactHelper.js";
import { estimateTokens } from "../utils/tokenCounter.js";
import { runAgentLoop } from "../core/agent/loop.js";
import { syncServerWorkspaceFiles } from "../utils/fileCommands.js";
import { buildSystemPrompt } from "../core/prompt/builder.js";
import { getConfigDir, loadSettings, saveSettings } from "../cli/config.js";
import type { PermissionMode } from "../cli/config.js";
import { BUILTIN, allCommands, loadCustomCommands, resolveAlias } from "./commands.js";
import { DEFAULT_CONFIG, FIELDS, mask, parseValue, show } from "./settings.js";
import type { TuiConfig, Field } from "./settings.js";
import { listSessions, loadSession, newSessionId, saveSession, deleteSession } from "./sessions.js";
import { buildLines } from "./layout.js";
import type { VirtualFile } from "../types.js";
import { ChatView, ConfigRows, Header, InputBox, McpRows, Panel, PermissionBox, Sidebar, StatusBar, Suggestions } from "./components.js";
import type { ApiMessage, ChatEntry, CustomCommand, PanelState, PendingDecision, PendingState, SessionMeta } from "./types.js";

const uid = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const PERMS: PermissionMode[] = ["ask", "autoEdit", "readOnly"];
const SIDEBAR_W = 28;

const fences = (t: string): number => (t.match(/^\s*```/gm) || []).length;

const stripForDisplay = (t: string): string => {
  let out = stripMcpCalls(stripRunCodeCommands(cleanAiCommands(t)));
  if (fences(t) % 2 === 0 && fences(out) % 2 === 1) out += "\n```";
  return out;
};

function splitContent(full: string, cfg: TuiConfig): { text: string; thought: string; thinking: boolean } {
  const segs = (full || "").split(/\[\/?INTERMEDIATE\]/).filter((s) => s.trim() !== "");
  const prose: string[] = [];
  const thoughts: string[] = [];
  let thinking = false;
  segs.forEach((seg, i) => {
    let main = seg;
    try {
      const p = parseThinkContent(seg, cfg.thinkStartTag || "<think>", cfg.thinkEndTag || "</think>");
      main = p.mainText ?? seg;
      if (p.thoughtText && p.thoughtText.trim()) thoughts.push(p.thoughtText.trim());
      if (i === segs.length - 1) thinking = !!p.isThinking;
    } catch {
      /* ignore */
    }
    const cleaned = stripForDisplay(main).replace(/\n{3,}/g, "\n\n").trim();
    if (cleaned) prose.push(cleaned);
  });
  return { text: prose.join("\n\n"), thought: thoughts.join("\n\n"), thinking };
}

function pickKnown(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULT_CONFIG)) if (src[k] !== undefined && src[k] !== "") out[k] = src[k];
  return out;
}

export interface TuiStartOpts {
  workspace: string;
  fanlucMd: { path: string; content: string } | null;
  config: Partial<TuiConfig>;
  permission: PermissionMode;
  port: number;
  onExit: () => void;
}

export function TuiApp({ workspace, fanlucMd, config: initialConfig, permission: initialPerm, port, onExit }: TuiStartOpts): React.JSX.Element {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const isTTY = !!process.stdin.isTTY;
  const configDir = useMemo(() => getConfigDir(), []);
  const version = process.env.FANLUC_VERSION || "0.0.0";
  const [cols, setCols] = useState(stdout.columns || 100);
  const [rows, setRows] = useState(stdout.rows || 30);
  useEffect(() => {
    const on = (): void => {
      setCols(stdout.columns || 100);
      setRows(stdout.rows || 30);
    };
    stdout.on("resize", on);
    return () => {
      stdout.off("resize", on);
    };
  }, [stdout]);

  const [config, setConfig] = useState<TuiConfig>(() => {
    let disk: Record<string, unknown> = {};
    try {
      disk = pickKnown(loadSettings());
    } catch {
      /* ignore */
    }
    return { ...DEFAULT_CONFIG, ...initialConfig, ...disk } as TuiConfig;
  });
  const configRef = useRef(config);
  configRef.current = config;
  const [permission, setPermission] = useState<PermissionMode>(initialPerm);
  const permissionRef = useRef(permission);
  permissionRef.current = permission;
  const [extra, setExtra] = useState(() => {
    let s: Record<string, unknown> = {};
    try {
      s = loadSettings();
    } catch {
      /* ignore */
    }
    return {
      searxngUrl: (s.searxngUrl as string) || getSearxngUrl() || "",
      port: (s.port as number) ?? port,
      host: (s.host as string) || "127.0.0.1",
    };
  });

  const [entries, setEntriesS] = useState<ChatEntry[]>([]);
  const entriesRef = useRef<ChatEntry[]>([]);
  const setEntries = (fn: (prev: ChatEntry[]) => ChatEntry[]): void => {
    entriesRef.current = fn(entriesRef.current);
    setEntriesS(entriesRef.current);
  };
  const msgsRef = useRef<ApiMessage[]>([]);
  const sid = useRef(newSessionId());
  const createdAt = useRef(Date.now());
  const titleRef = useRef("New session");
  const [title, setTitle] = useState("New session");
  const [workspaceFiles, setWorkspaceFiles] = useState<Record<string, VirtualFile>>({});
  const filesRef = useRef<Record<string, VirtualFile>>({});
  filesRef.current = workspaceFiles;
  const [live, setLive] = useState<ChatEntry | null>(null);
  const liveRef = useRef<ChatEntry | null>(null);
  const toolsRef = useRef<{ id: string; name: string; input: string; status: "running" | "done" | "error"; output?: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [frame, setFrame] = useState(FRAMES[0]);
  const abortRef = useRef<AbortController | null>(null);
  const [pending, setPending] = useState<PendingState | null>(null);
  const pendingRef = useRef<PendingState | null>(null);
  pendingRef.current = pending;
  const [ed, setEd] = useState({ v: "", c: 0 });
  const histRef = useRef<string[]>([]);
  const histIdx = useRef(-1);
  const [sugSel, setSugSel] = useState(0);
  const [scroll, setScroll] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusOn, setFocusOn] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const [sidebarOn, setSidebarOn] = useState(true);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [sideSel, setSideSel] = useState(0);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const escArmed = useRef(false);
  const exitArmed = useRef(false);
  const [custom, setCustom] = useState<CustomCommand[]>(() => loadCustomCommands(workspace, configDir));
  const commands = useMemo(() => allCommands(custom), [custom]);

  const refreshSessions = (): void => setSessions(listSessions(configDir, workspace));
  useEffect(() => {
    refreshSessions();
  }, []);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setFrame((f) => FRAMES[(FRAMES.indexOf(f) + 1) % FRAMES.length]), 100);
    return () => clearInterval(t);
  }, [running]);

  const note = (text: string, level?: "error" | "warn" | "info"): void =>
    setEntries((e) => [...e, { id: uid(), kind: "note", text, level }]);

  const save = (): void => {
    if (!entriesRef.current.some((e) => e.kind === "user")) return;
    saveSession(configDir, {
      id: sid.current,
      title: titleRef.current,
      workspace,
      createdAt: createdAt.current,
      updatedAt: Date.now(),
      entries: entriesRef.current,
      messages: msgsRef.current,
    });
    refreshSessions();
  };

  const persist = (patch: Record<string, unknown>): void => {
    try {
      saveSettings({ ...loadSettings(), ...patch });
    } catch {
      /* ignore */
    }
  };

  // Server-side permission queue watcher: approvals requested by run-cmd
  // (ask categories, size limits) are answered inline in the terminal.
  useEffect(() => {
    let stop = false;
    const poll = async (): Promise<void> => {
      if (stop) return;
      try {
        if (!pendingRef.current) {
          const r = await fetch("/api/permissions/pending");
          if (r.ok) {
            const d = (await r.json()) as {
              pending: { id: string; command: string; categories: string[]; reasons: string[] }[];
            };
            const first = d.pending?.[0];
            if (first && !pendingRef.current) {
              const id = first.id;
              const msg = `$ ${first.command}\n${first.categories.join(", ")}${first.reasons.length ? ` - ${first.reasons.join("; ")}` : ""}`;
              setPending({
                type: "approval",
                message: msg,
                at: Date.now(),
                resolve: (decision) => {
                  void (async () => {
                    try {
                      const dr = await fetch("/api/permissions/decide", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          id,
                          allow: decision !== false,
                          remember: decision === "auto",
                        }),
                      });
                      if (!dr.ok) note("That approval was already resolved elsewhere.", "warn");
                    } catch {
                      /* ignore */
                    }
                  })();
                },
              });
            }
          }
        }
      } catch {
        /* server not up yet */
      }
      if (!stop) setTimeout(poll, 900);
    };
    const t = setTimeout(poll, 1200);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (!initialConfig.apiUrl && !config.apiUrl)
      note("No API configured. Run /config and enter the API URL, key and model.", "warn");
  }, []);

  const applyField = async (f: Field, value: unknown): Promise<string | null> => {
    switch (f.scope) {
      case "config":
        setConfig((c) => ({ ...c, [f.key]: value }) as TuiConfig);
        persist({ [f.key]: value });
        return null;
      case "permission": {
        const mode = value as PermissionMode;
        setPermission(mode);
        persist({ permission: mode });
        return null;
      }
      case "searx":
        setSearxngUrl(String(value ?? ""));
        persist({ searxngUrl: String(value ?? "") });
        setExtra((x) => ({ ...x, searxngUrl: String(value ?? "") }));
        return null;
      case "settings":
        persist({ [f.key]: value });
        setExtra((x) => ({ ...x, [f.key]: value }));
        return null;
    }
  };

  const fieldValues = (): Record<string, unknown> => ({
    ...config,
    permission,
    searxngUrl: extra.searxngUrl,
    port: extra.port,
    host: extra.host,
  });

  const setByKey = async (key: string, raw: string): Promise<boolean> => {
    const f = FIELDS.find((x) => x.key === key);
    if (!f) {
      note(`Unknown setting: ${key}`, "error");
      return false;
    }
    const p = parseValue(f, raw);
    if (!p.ok) {
      note(p.error || "Invalid value", "error");
      return false;
    }
    const err = await applyField(f, p.value);
    if (err) {
      note(err, "error");
      return false;
    }
    note(`${f.label} = ${f.type === "secret" ? mask(p.value) : String(p.value === "" ? "(empty)" : p.value)}${f.restart ? "  (restart fanluc to apply)" : ""}`);
    return true;
  };

  /** Inline confirm for local file operations (ask mode). */
  const confirmFile = (message: string): Promise<boolean> =>
    new Promise((resolve) => {
      setPending({
        type: "file",
        message,
        at: Date.now(),
        resolve: (d) => {
          if (d === "auto") {
            void applyField(FIELDS.find((f) => f.key === "permission") as Field, "autoEdit");
          }
          resolve(d !== false);
        },
      });
    });

  const ctxTokens = (): number => {
    let n = 0;
    for (const m of msgsRef.current) n += estimateTokens(typeof m.content === "string" ? m.content : JSON.stringify(m.content));
    return n;
  };
  const sysTokens = (): number => {
    try {
      return estimateTokens(buildSystemPrompt({ config: configRef.current, fanlucMd, mcpToolsPrompt: "" }));
    } catch {
      return 0;
    }
  };

  const runTurn = async (text: string, shown?: string): Promise<void> => {
    if (!configRef.current.apiUrl) {
      note("No API URL set. Run /config to enter it.", "warn");
      return;
    }
    if (!entriesRef.current.some((e) => e.kind === "user")) {
      const t = (shown || text).replace(/\s+/g, " ").trim();
      titleRef.current = t.length > 48 ? t.slice(0, 47) + "…" : t;
      setTitle(titleRef.current);
    }
    setEntries((e) => [...e, { id: uid(), kind: "user", text: shown || text }]);
    const userMsg: ApiMessage = { id: uid(), role: "user", content: text, timestamp: Date.now() };
    msgsRef.current = [...msgsRef.current, userMsg];
    setRunning(true);
    setScroll(0);
    setFocusOn(false);
    const ac = new AbortController();
    abortRef.current = ac;
    // Esc while a permission box is open must not hang the turn:
    // deny whatever is pending so the loop can unwind to "[Stopped]".
    ac.signal.addEventListener(
      "abort",
      () => {
        const p = pendingRef.current;
        if (p) {
          pendingRef.current = null;
          setPending(null);
          try {
            p.resolve(false);
          } catch {
            /* ignore */
          }
        }
      },
      { once: true }
    );
    const t0 = Date.now();
    toolsRef.current = [];
    const base: ChatEntry = { id: uid(), kind: "assistant", text: "", tools: [], live: true };
    liveRef.current = base;
    setLive(base);
    const cfg = configRef.current;
    // Prime the virtual file map from disk: otherwise the first
    // Read/Glob of a turn would see an empty (or stale) map.
    try {
      filesRef.current = await syncServerWorkspaceFiles(filesRef.current);
      setWorkspaceFiles(filesRef.current);
    } catch {
      /* loop still works with the in-memory map */
    }
    const setLiveEntry = (patch: Partial<Extract<ChatEntry, { kind: "assistant" }>>): void => {
      const cur = liveRef.current;
      if (!cur || cur.kind !== "assistant") return;
      const next = { ...cur, ...patch };
      liveRef.current = next;
      setLive(next);
    };
    try {
      const mcpPrompt = await getMcpToolsPrompt().catch(() => "");
      const sys = buildSystemPrompt({ config: cfg, fanlucMd, mcpToolsPrompt: mcpPrompt });
      const payload: { role: string; content: string }[] = [];
      if (sys) payload.push({ role: "system", content: sys });
      msgsRef.current.slice(-20).forEach((m) => payload.push({ role: m.role, content: m.content }));
      const result = await runAgentLoop({
        apiMessagesPayload: payload,
        baseMessages: msgsRef.current,
        config: cfg,
        fanlucMd,
        text,
        currentSessionFiles: filesRef.current,
        signal: ac.signal,
        permission: permissionRef.current,
        confirmFile,
        onChunk: (full) => {
          const s2 = splitContent(full, cfg);
          setLiveEntry({
            text: s2.text,
            thought: s2.thought || s2.thinking
              ? { text: s2.thought, seconds: Math.round((Date.now() - t0) / 1e3), live: s2.thinking }
              : undefined,
          });
        },
        onStatus: (s2) => setStatus(s2),
        onTool: (ev) => {
          const i = toolsRef.current.findIndex((x) => x.id === ev.id);
          if (i >= 0) toolsRef.current[i] = ev;
          else toolsRef.current.push(ev);
          setLiveEntry({ tools: [...toolsRef.current] });
        },
      });
      const am = result.assistantMessage;
      msgsRef.current = [...msgsRef.current, { id: am.id, role: "assistant" as const, content: am.content, timestamp: am.timestamp }];
      setWorkspaceFiles(result.updatedFiles);
      const s = splitContent(typeof am.content === "string" ? am.content : "", cfg);
      const secs = am.durationSeconds ?? Math.round((Date.now() - t0) / 1e3);
      setEntries((e) => [
        ...e,
        {
          id: uid(),
          kind: "assistant",
          text: s.text || (toolsRef.current.length ? "" : "(model returned nothing)"),
          thought: s.thought ? { text: s.thought, seconds: secs } : undefined,
          tools: [...toolsRef.current],
          files: am.fileArtifacts,
        },
      ]);
    } catch (e: unknown) {
      const err = e as Error;
      const partial = liveRef.current;
      if (partial && ((partial.kind === "assistant" && (partial.text || partial.tools.length)) || partial.kind !== "assistant"))
        setEntries((es) => [...es, { ...(partial as Extract<ChatEntry, { kind: "assistant" }>), live: false }]);
      const aborted = err?.name === "AbortError" || ac.signal.aborted;
      note(aborted ? "[Stopped]" : `[Error] ${err?.message || e}`, aborted ? "info" : "error");
    } finally {
      liveRef.current = null;
      setLive(null);
      setRunning(false);
      setStatus(null);
      abortRef.current = null;
      save();
    }
  };

  const newSession = (saveFirst = true): void => {
    if (saveFirst) save();
    entriesRef.current = [];
    setEntriesS([]);
    msgsRef.current = [];
    sid.current = newSessionId();
    createdAt.current = Date.now();
    titleRef.current = "New session";
    setTitle("New session");
    setScroll(0);
    setExpanded(new Set());
    setFocusOn(false);
    setWorkspaceFiles({});
    process.stdout.write("\x1B[2J\x1B[3J\x1B[H");
    refreshSessions();
  };

  const dropSessionFile = (id: string): boolean => deleteSession(configDir, id);

  const deleteAndFresh = (id: string): void => {
    dropSessionFile(id);
    // Start over without re-saving the deleted session.
    newSession(false);
    refreshSessions();
  };

  const openSession = (id: string): void => {
    if (running) {
      note("Busy - press Esc to stop first.", "warn");
      return;
    }
    const s = loadSession(configDir, id);
    if (!s) {
      note("Could not open that session.", "error");
      return;
    }
    save();
    entriesRef.current = s.entries;
    setEntriesS(s.entries);
    msgsRef.current = s.messages || [];
    sid.current = s.id;
    createdAt.current = s.createdAt;
    titleRef.current = s.title;
    setTitle(s.title);
    setScroll(0);
    setExpanded(new Set());
    setFocusOn(false);
    setPanel(null);
    // Drop the previous session's virtual files and re-sync from disk,
    // otherwise Read/Edit would see stale files from another session.
    setWorkspaceFiles({});
    filesRef.current = {};
    void syncServerWorkspaceFiles({})
      .then((fresh) => {
        if (sid.current === s.id) {
          filesRef.current = fresh;
          setWorkspaceFiles(fresh);
        }
      })
      .catch(() => {
        /* offline until first tool runs */
      });
    process.stdout.write("\x1B[2J\x1B[3J\x1B[H");
  };

  const helpText = (): string => {
    const lines2 = commands.map((c) => `  ${(c.name + (c.args ? " " + c.args : "")).padEnd(40)} ${c.desc}`);
    return [
      "Commands:",
      ...lines2,
      "",
      "Keys:",
      "  Enter send · \\+Enter or Alt+Enter newline · Tab complete command / switch block · Enter (empty input) open/close block",
      "  Esc stop · Esc then Esc clears input · Ctrl+C stop/clear/quit · Ctrl+D quit · Ctrl+L redraw",
      "  Shift+Tab cycle permission (ask -> autoEdit -> readOnly) · Ctrl+O open/close all blocks",
      "  PgUp/PgDn or Up/Down (empty input) scroll · Up/Down while typing = history · Ctrl+B sidebar · Ctrl+N new session · Ctrl+F find session",
      "  Line start: /command · !shell runs directly",
    ].join("\n");
  };

  const modelBase = (): string =>
    configRef.current.apiUrl.replace(/\/chat\/completions\/?$/, "").replace(/\/$/, "");

  const runSlash = async (textRaw: string): Promise<void> => {
    const [cmdRaw, ...rest] = textRaw.trim().split(/\s+/);
    const cmd = resolveAlias(cmdRaw);
    const arg = rest.join(" ").trim();
    const cc = custom.find((c) => c.name === cmd);
    if (cc) {
      await runTurn(cc.body.replace(/\$ARGUMENTS/g, arg), textRaw);
      return;
    }
    switch (cmd) {
      case "/help":
        note(helpText());
        return;
      case "/config":
        setPanel({ type: "config", sel: 0, editing: false, buf: "" });
        return;
      case "/effort":
      case "/permissions": {
        const key = cmd === "/effort" ? "effort" : "permission";
        const f = FIELDS.find((x) => x.key === key) as Field;
        if (!arg) {
          let extraInfo = "";
          if (key === "permission") {
            try {
              const r = await fetch("/api/permissions");
              if (r.ok) {
                const p = (await r.json()) as { modes?: Record<string, string>; limits?: Record<string, string> };
                const modes = Object.entries(p.modes || {})
                  .map(([k, v]) => `${k}=${v}`)
                  .join(" ");
                extraInfo = `\nServer: ${modes || "(n/a)"}`;
              }
            } catch {
              /* ignore */
            }
          }
          note(`${f.label} now: ${String(fieldValues()[key])}\nValues: ${f.options?.join(" | ")}${extraInfo}`);
          return;
        }
        if (cmdRaw.toLowerCase() === "/plan") {
          await setByKey("permission", "readOnly");
          return;
        }
        await setByKey(key, arg);
        return;
      }
      case "/model": {
        if (arg) {
          await setByKey("model", arg);
          return;
        }
        if (!configRef.current.apiUrl) {
          note("No API URL set.", "warn");
          return;
        }
        note("Fetching model list…");
        try {
          const r = await fetch(modelBase() + "/models", {
            headers: { Authorization: `Bearer ${configRef.current.apiKey}`, "ngrok-skip-browser-warning": "true" },
            signal: AbortSignal.timeout(8000),
          });
          const j = (await r.json()) as { data?: { id?: string; name?: string }[]; models?: { id?: string; name?: string }[] };
          const ids = (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean) as string[];
          if (!ids.length) throw new Error("server returned no model list");
          setPanel({ type: "list", kind: "model", title: "Pick model", items: ids.map((id) => ({ label: id, value: id })), sel: Math.max(0, ids.indexOf(configRef.current.model)) });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          note(`Could not fetch the model list (${msg}). Use: /model <name>`, "warn");
        }
        return;
      }
      case "/mcp": {
        const m = arg.match(/^add\s+(\S+)\s+(.+)$/i);
        if (m) {
          const [, name, rest2] = m;
          const parts = rest2.trim().split(/\s+/);
          const payload = /^https?:\/\//i.test(parts[0])
            ? { name, type: "http", url: parts[0], enabled: true }
            : { name, type: "stdio", command: parts[0], args: parts.slice(1), enabled: true };
          try {
            const r = (await addMcpServer(payload)) as { error?: string };
            note(r?.error ? `Error: ${r.error}` : `Added MCP "${name}". Open /mcp for status.`, r?.error ? "error" : "info");
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            note(`Error: ${msg}`, "error");
          }
          return;
        }
        setPanel({ type: "mcp", sel: 0, servers: [], loading: true });
        try {
          const d = await fetchMcpStatus();
          setPanel({ type: "mcp", sel: 0, servers: d.servers, loading: false });
        } catch (e: unknown) {
          setPanel(null);
          const msg = e instanceof Error ? e.message : String(e);
          note(`MCP error: ${msg}`, "error");
        }
        return;
      }
      case "/resume": {
        const list = listSessions(configDir, workspace).filter((s) => s.id !== sid.current);
        if (arg) {
          const n = Number(arg);
          const target =
            Number.isInteger(n) && n >= 1
              ? list[n - 1]
              : list.find((s) => s.id === arg || s.title.toLowerCase().includes(arg.toLowerCase()));
          if (target) openSession(target.id);
          else note("Session not found.", "warn");
          return;
        }
        if (!list.length) {
          note("No other sessions in this folder.");
          return;
        }
        setPanel({ type: "list", kind: "resume", title: "Reopen session", items: list.map((s) => ({ label: s.title, value: s.id })), sel: 0 });
        return;
      }
      case "/delete": {
        if (running) {
          note("Busy - press Esc to stop first.", "warn");
          return;
        }
        const list = listSessions(configDir, workspace);
        const target = !arg
          ? list.find((s) => s.id === sid.current) ?? (entriesRef.current.length ? { id: sid.current, title: titleRef.current } : undefined)
          : arg.toLowerCase() === "all"
            ? undefined
            : (() => {
                const n = Number(arg);
                return Number.isInteger(n) && n >= 1
                  ? list[n - 1]
                  : list.find((s) => s.id === arg || s.title.toLowerCase().includes(arg.toLowerCase()));
              })();
        if (arg.toLowerCase() === "all") {
          if (!list.length) {
            note("No sessions to delete.");
            return;
          }
          const currentGone = list.some((s) => s.id === sid.current);
          for (const s of list) dropSessionFile(s.id);
          if (currentGone || !entriesRef.current.length) {
            newSession(false);
          }
          refreshSessions();
          note(`Deleted ${list.length} session(s).`);
          return;
        }
        if (!target) {
          note(entriesRef.current.length ? "Session not found. Usage: /delete [number|id|all]" : "Nothing to delete.", "warn");
          return;
        }
        if (target.id === sid.current) {
          deleteAndFresh(target.id);
          note("Deleted the current session.");
          return;
        }
        if (dropSessionFile(target.id)) {
          refreshSessions();
          note(`Deleted session.`);
        } else {
          note("Could not delete that session.", "error");
        }
        return;
      }
      case "/clear":
        newSession();
        return;
      case "/compact": {
        const msgs = msgsRef.current;
        if (msgs.length < MIN_MESSAGES_TO_COMPACT) {
          note("Not enough history to compact.");
          return;
        }
        setRunning(true);
        setStatus("Compacting history…");
        const ac = new AbortController();
        abortRef.current = ac;
        try {
          const summary = await sendChatMessage(
            buildCompactSummaryPayload(msgs, arg) as { role: string; content: string | unknown[] }[],
            configRef.current as never,
            undefined,
            ac.signal
          );
          const before = ctxTokens();
          const after = estimateTokens(summary);
          const compacted = formatCompactedMessage(summary, { beforeMessages: msgs.length, beforeTokens: before, afterTokens: after });
          msgsRef.current = [{ id: uid(), role: "assistant", content: compacted, timestamp: Date.now() }];
          setEntries(() => [{ id: uid(), kind: "note", text: `Compacted ${msgs.length} messages (~${before} -> ~${after} tokens).` }]);
          setScroll(0);
          save();
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          note(ac.signal.aborted ? "[Stopped]" : `Compact error: ${msg}`, "error");
        } finally {
          setRunning(false);
          setStatus(null);
          abortRef.current = null;
        }
        return;
      }
      case "/context": {
        const sys = sysTokens();
        const msgs = ctxTokens();
        const total = sys + msgs;
        note(`Context (estimated tokens)\n  system prompt ~${sys}\n  conversation ~${msgs} (${msgsRef.current.length} messages)\n  total ~${total}`);
        return;
      }
      case "/cost": {
        const user = msgsRef.current.filter((m) => m.role === "user").reduce((n, m) => n + estimateTokens(String(m.content)), 0);
        const ai = msgsRef.current.filter((m) => m.role === "assistant").reduce((n, m) => n + estimateTokens(String(m.content)), 0);
        const tools = entriesRef.current.reduce((n, e) => n + (e.kind === "assistant" ? e.tools.length : 0), 0);
        note(`This session (estimates, local models are free)\n  user turns: ${msgsRef.current.filter((m) => m.role === "user").length}\n  tokens in ~${user} · tokens out ~${ai}\n  tool calls: ${tools}\n  started: ${new Date(createdAt.current).toLocaleString()}`);
        return;
      }
      case "/status": {
        note(
          [
            `fanluc v${version} · node ${process.version} · ${process.platform}`,
            `API      : ${config.apiUrl || "(not set)"}`,
            `Model    : ${config.model || "(default)"}`,
            `Effort   : ${config.effort}   Reasoning: ${config.reasoningEffort}`,
            `Permission: ${permission}`,
            `SearXNG  : ${extra.searxngUrl || "(off)"}`,
            `Workspace: ${workspace}`,
            `FANLUC.md: ${fanlucMd ? fanlucMd.path : "(none)"}`,
            `Config   : ${configDir}`,
            `Server   : http://127.0.0.1:${port}`,
          ].join("\n")
        );
        return;
      }
      case "/doctor": {
        const res: string[] = [];
        const ok = (b: boolean, s: string): void => {
          res.push(`${b ? "+" : "x"} ${s}`);
        };
        ok(parseInt(process.versions.node) >= 18, `Node ${process.version} (needs >= 18)`);
        try {
          const r = await fetch("/api/health", { signal: AbortSignal.timeout(3000) });
          const j = (await r.json().catch(() => ({}))) as { status?: string };
          ok(r.ok, `Local server :${port} (${j.status || "no status"})`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          ok(false, `Local server: ${msg}`);
        }
        if (config.apiUrl) {
          try {
            const r = await fetch(modelBase() + "/models", {
              headers: { Authorization: `Bearer ${config.apiKey}`, "ngrok-skip-browser-warning": "true" },
              signal: AbortSignal.timeout(6000),
            });
            ok(r.ok, `API ${modelBase()} -> HTTP ${r.status}`);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            ok(false, `API ${modelBase()}: ${msg}`);
          }
        } else ok(false, "API URL not set (/config)");
        try {
          fs.accessSync(workspace, fs.constants.W_OK);
          ok(true, `Workspace writable: ${workspace}`);
        } catch {
          ok(false, `Workspace NOT writable: ${workspace}`);
        }
        try {
          fs.mkdirSync(configDir, { recursive: true });
          fs.accessSync(configDir, fs.constants.W_OK);
          ok(true, `Config dir writable: ${configDir}`);
        } catch {
          ok(false, `Config dir NOT writable: ${configDir}`);
        }
        try {
          const d = await fetchMcpStatus();
          ok(true, `MCP: ${d.servers.filter((s) => s.status === "connected").length}/${d.servers.length} servers connected`);
        } catch {
          ok(false, "MCP: status unreadable");
        }
        if (process.platform === "win32") res.push("i Windows: run_cmd forces UTF-8 for PowerShell; UTF-16/ANSI files are auto-decoded on read.");
        if (process.env.FANLUC_SERVER_LOG) res.push(`i Server log: ${process.env.FANLUC_SERVER_LOG}`);
        note(res.join("\n"));
        return;
      }
      case "/init": {
        await runTurn(
          "Explore the workspace (use Glob, then Read key files like package.json, README and config files), then create a FANLUC.md file in the root, short (under 60 lines): project goal, folder structure, build/test/run commands, code rules to remember. If FANLUC.md already exists, improve it without losing old content.",
          "/init"
        );
        return;
      }
      case "/memory": {
        if (!fanlucMd) {
          note("No FANLUC.md. Run /init to create one, or create FANLUC.md in the workspace root yourself.");
          return;
        }
        note(`${fanlucMd.path}\n${"─".repeat(20)}\n${fanlucMd.content.split("\n").slice(0, 40).join("\n")}`);
        return;
      }
      case "/rename": {
        if (!arg) {
          note("Usage: /rename <name>");
          return;
        }
        titleRef.current = arg;
        setTitle(arg);
        save();
        return;
      }
      case "/export": {
        const name = (arg || `fanluc-${new Date().toISOString().slice(0, 10)}.md`).replace(/[\\/:*?"<>|]/g, "_");
        const md = entriesRef.current
          .map((e) =>
            e.kind === "user"
              ? `## You\n${e.text}\n`
              : e.kind === "assistant"
                ? `## fanluc\n${e.text}\n${e.tools.map((t) => `\n> ${t.name}: ${t.input.split("\n")[0]}`).join("")}\n`
                : `> ${e.text}\n`
          )
          .join("\n");
        try {
          fs.writeFileSync(path.join(workspace, name), md, "utf-8");
          note(`Exported: ${name}`, "info");
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          note(`Export error: ${msg}`, "error");
        }
        return;
      }
      case "/exit":
        onExit();
        exit();
        return;
      default:
        note(`Unknown command: ${cmdRaw}. Run /help.`, "warn");
    }
  };

  const runBash = async (cmd: string): Promise<void> => {
    if (!cmd.trim()) return;
    if (!entriesRef.current.some((e) => e.kind === "user")) {
      titleRef.current = ("! " + cmd).slice(0, 47);
      setTitle(titleRef.current);
    }
    setEntries((e) => [...e, { id: uid(), kind: "user", text: "! " + cmd }]);
    const ev = { id: uid(), name: "Bash", input: cmd, status: "running" as const };
    const eid = uid();
    setRunning(true);
    setStatus("Running command…");
    try {
      if (permissionRef.current === "readOnly") {
        const out = "Blocked by readOnly permission mode: shell commands are disabled.";
        setEntries((e) => [...e, { id: eid, kind: "assistant", text: "", tools: [{ ...ev, status: "error" as const, output: out }] }]);
      } else {
        const out = await executeRunCmd(cmd);
        const bad = /^\s*(error|blocked)/i.test(out) || /Blocked by permission/i.test(out);
        setEntries((e) => [...e, { id: eid, kind: "assistant", text: "", tools: [{ ...ev, status: bad ? ("error" as const) : ("done" as const), output: out }] }]);
        msgsRef.current = [
          ...msgsRef.current,
          {
            id: uid(),
            role: "user",
            content: `I ran a shell command: ${cmd}\nResult:\n${out.slice(0, 4000)}`,
            timestamp: Date.now(),
          },
        ];
        setExpanded((x) => new Set(x).add(`${eid}:${ev.id}`));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      note(`Error: ${msg}`, "error");
    } finally {
      setRunning(false);
      setStatus(null);
      save();
    }
  };

  const submit = async (raw: string): Promise<void> => {
    const text = raw.trim();
    if (!text) return;
    histRef.current.push(text);
    histIdx.current = -1;
    setEd({ v: "", c: 0 });
    setSugSel(0);
    if (running) {
      note("Busy - press Esc to stop first.", "warn");
      return;
    }
    if (text.startsWith("/")) {
      await runSlash(text);
      return;
    }
    if (text.startsWith("!")) {
      await runBash(text.slice(1));
      return;
    }
    await runTurn(text);
  };

  const showSide = sidebarOn && cols >= 80;
  const sugAll = useMemo(() => {
    if (!ed.v.startsWith("/") || ed.v.includes(" ") || running || pending || panel) return [];
    const q = ed.v.toLowerCase();
    return commands.filter((c) => c.name.startsWith(q) || c.aliases?.some((a) => a.startsWith(q))).slice(0, 7);
  }, [ed.v, running, pending, panel, commands]);

  const bottomH = pending ? 5 : 3;
  const mainH = Math.max(6, rows - 2 - bottomH - 1 - sugAll.length);
  const chatW = showSide ? Math.max(30, cols - SIDEBAR_W) : cols;
  const all = live ? [...entries, live] : entries;
  const { lines, blocks } = useMemo(
    () => buildLines(all, { width: chatW - 2, expanded, focusId: focusOn ? blocksSafe(focusIdx, all, chatW, expanded) : null, frame }),
    [all, chatW, expanded, focusOn, focusIdx, running ? frame : ""]
  );
  const filtered = useMemo(
    () => sessions.filter((s) => !query || s.title.toLowerCase().includes(query.toLowerCase())),
    [sessions, query]
  );

  useInput(
    (ch, key) => {
      if (pending) {
        if (Date.now() - pending.at < 700 || ch.length > 1) return;
        const c = ch.toLowerCase();
        if (c === "y" || key.return) {
          const r = pending.resolve;
          setPending(null);
          r(true);
        } else if (c === "a") {
          const r = pending.resolve;
          setPending(null);
          r("auto");
        } else if (c === "n" || key.escape) {
          const r = pending.resolve;
          setPending(null);
          r(false);
        }
        return;
      }
      if (key.ctrl && ch === "c") {
        if (running && abortRef.current) {
          abortRef.current.abort();
          return;
        }
        if (ed.v) {
          setEd({ v: "", c: 0 });
          return;
        }
        if (exitArmed.current) {
          onExit();
          exit();
          return;
        }
        exitArmed.current = true;
        note("Press Ctrl+C again to quit.", "info");
        setTimeout(() => {
          exitArmed.current = false;
        }, 2500);
        return;
      }
      if (key.ctrl && ch === "d" && !ed.v) {
        onExit();
        exit();
        return;
      }
      if (panel) {
        handlePanelKey(ch, key);
        return;
      }
      if (searching) {
        if (key.escape) {
          setSearching(false);
          setQuery("");
          return;
        }
        if (key.return) {
          const s = filtered[sideSel];
          setSearching(false);
          setQuery("");
          if (s) openSession(s.id);
          return;
        }
        if (key.upArrow) {
          setSideSel((i) => Math.max(0, i - 1));
          return;
        }
        if (key.downArrow) {
          setSideSel((i) => Math.min(Math.max(0, filtered.length - 1), i + 1));
          return;
        }
        if (key.backspace || key.delete) {
          setQuery((q) => q.slice(0, -1));
          setSideSel(0);
          return;
        }
        if (ch && !key.ctrl && !key.meta) {
          setQuery((q) => q + ch);
          setSideSel(0);
        }
        return;
      }
      if (key.ctrl) {
        switch (ch) {
          case "b":
            setSidebarOn((v) => !v);
            return;
          case "n":
            if (!running) newSession();
            return;
          case "f":
            setSidebarOn(true);
            refreshSessions();
            setSearching(true);
            setSideSel(0);
            return;
          case "o":
            setExpanded((x) => (x.size ? new Set<string>() : new Set(blocks)));
            return;
          case "l":
            process.stdout.write("\x1B[2J\x1B[3J\x1B[H");
            setCols((c) => c);
            setRows((r) => r);
            return;
          case "a":
            setEd((e) => ({ ...e, c: 0 }));
            return;
          case "e":
            setEd((e) => ({ ...e, c: e.v.length }));
            return;
          case "u":
            setEd((e) => ({ v: e.v.slice(e.c), c: 0 }));
            return;
          case "k":
            setEd((e) => ({ v: e.v.slice(0, e.c), c: e.c }));
            return;
          case "w":
            setEd((e) => {
              const before = e.v.slice(0, e.c).replace(/\s*\S*$/, "");
              return { v: before + e.v.slice(e.c), c: before.length };
            });
            return;
          case "p":
            recall(1);
            return;
          case "j":
            setEd((e) => ({ v: e.v.slice(0, e.c) + "\n" + e.v.slice(e.c), c: e.c + 1 }));
            return;
        }
        return;
      }
      if (key.escape) {
        if (running && abortRef.current) {
          abortRef.current.abort();
          return;
        }
        if (expanded.size) {
          setExpanded(new Set<string>());
          return;
        }
        if (ed.v) {
          if (escArmed.current) {
            setEd({ v: "", c: 0 });
            escArmed.current = false;
          } else {
            escArmed.current = true;
            setTimeout(() => {
              escArmed.current = false;
            }, 1500);
          }
        }
        return;
      }
      if (key.pageUp) {
        setScroll((s) => s + Math.max(3, Math.floor(mainH / 2)));
        return;
      }
      if (key.pageDown) {
        setScroll((s) => Math.max(0, s - Math.max(3, Math.floor(mainH / 2))));
        return;
      }
      if (key.tab && key.shift) {
        const next = PERMS[(PERMS.indexOf(permission) + 1) % PERMS.length];
        void setByKey("permission", next);
        return;
      }
      if (key.tab) {
        if (sugAll.length) {
          const c = sugAll[Math.min(sugSel, sugAll.length - 1)];
          setEd({ v: c.name + (c.args ? " " : ""), c: c.name.length + (c.args ? 1 : 0) });
          setSugSel(0);
          return;
        }
        if (blocks.length) {
          setFocusOn(true);
          setFocusIdx((i) => (focusOn ? (i + 1) % blocks.length : Math.min(i, blocks.length - 1)));
        }
        return;
      }
      if (key.upArrow) {
        if (sugAll.length) {
          setSugSel((i) => (i - 1 + sugAll.length) % sugAll.length);
          return;
        }
        if (ed.v === "" && histIdx.current === -1) {
          setScroll((s) => s + 3);
          return;
        }
        recall(1);
        return;
      }
      if (key.downArrow) {
        if (sugAll.length) {
          setSugSel((i) => (i + 1) % sugAll.length);
          return;
        }
        if (ed.v === "" && histIdx.current === -1) {
          setScroll((s) => Math.max(0, s - 3));
          return;
        }
        recall(-1);
        return;
      }
      if (key.leftArrow) {
        setEd((e) => ({ ...e, c: Math.max(0, e.c - 1) }));
        return;
      }
      if (key.rightArrow) {
        setEd((e) => ({ ...e, c: Math.min(e.v.length, e.c + 1) }));
        return;
      }
      if (key.home) {
        setEd((e) => ({ ...e, c: 0 }));
        return;
      }
      if (key.end) {
        setEd((e) => ({ ...e, c: e.v.length }));
        return;
      }
      if (key.return) {
        if (key.meta) {
          setEd((e) => ({ v: e.v.slice(0, e.c) + "\n" + e.v.slice(e.c), c: e.c + 1 }));
          return;
        }
        if (ed.v.endsWith("\\")) {
          setEd({ v: ed.v.slice(0, -1) + "\n", c: ed.v.length });
          return;
        }
        if (ed.v.trim() === "") {
          if (focusOn && blocks[focusIdx]) {
            const id = blocks[focusIdx];
            setExpanded((x) => {
              const n = new Set(x);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            });
          }
          return;
        }
        let text = ed.v;
        if (sugAll.length && !/\s/.test(text) && !commands.some((c) => c.name === text.toLowerCase()))
          text = sugAll[Math.min(sugSel, sugAll.length - 1)].name;
        void submit(text);
        return;
      }
      if (key.backspace || key.delete) {
        setEd((e) => (e.c === 0 ? e : { v: e.v.slice(0, e.c - 1) + e.v.slice(e.c), c: e.c - 1 }));
        setSugSel(0);
        return;
      }
      if (ch && !key.meta) {
        const t = ch.replace(/\r\n?/g, "\n");
        setEd((e) => ({ v: e.v.slice(0, e.c) + t + e.v.slice(e.c), c: e.c + t.length }));
        setSugSel(0);
        histIdx.current = -1;
      }
    },
    { isActive: isTTY }
  );

  function recall(dir: number): void {
    const h = histRef.current;
    if (!h.length) return;
    histIdx.current = Math.max(-1, Math.min(h.length - 1, histIdx.current + dir));
    const v = histIdx.current < 0 ? "" : h[h.length - 1 - histIdx.current];
    setEd({ v, c: v.length });
  }

  function handlePanelKey(ch: string, key: { [k: string]: boolean | string }): void {
    const p = panel;
    if (!p) return;
    if (p.type === "config") {
      const f = FIELDS[p.sel];
      if (p.editing) {
        if (key.escape) {
          setPanel({ ...p, editing: false, buf: "", msg: undefined });
          return;
        }
        if (key.return) {
          const parsed = parseValue(f, p.buf);
          if (!parsed.ok) {
            setPanel({ ...p, msg: parsed.error || "Invalid value", ok: false });
            return;
          }
          void applyField(f, parsed.value).then((err) =>
            setPanel((cur) =>
              cur && cur.type === "config" ? { ...cur, editing: false, buf: "", msg: err || `Saved ${f.label}`, ok: !err } : cur
            )
          );
          return;
        }
        if (key.backspace || key.delete) {
          setPanel({ ...p, buf: p.buf.slice(0, -1), msg: undefined });
          return;
        }
        if (ch && !key.ctrl && !key.meta) {
          const t = String(ch).replace(/[\r\n]/g, "");
          setPanel({ ...p, buf: p.buf + t, msg: undefined });
        }
        return;
      }
      if (key.escape || ch === "q") {
        setPanel(null);
        return;
      }
      if (key.upArrow) {
        setPanel({ ...p, sel: (p.sel - 1 + FIELDS.length) % FIELDS.length, msg: undefined });
        return;
      }
      if (key.downArrow) {
        setPanel({ ...p, sel: (p.sel + 1) % FIELDS.length, msg: undefined });
        return;
      }
      const cur = fieldValues()[f.key];
      if (key.return || ch === " ") {
        const done = (v: unknown): void => {
          void applyField(f, v).then((err) =>
            setPanel((c) =>
              c && c.type === "config" ? { ...c, msg: err || `${f.label} -> ${f.type === "secret" ? "saved" : String(v)}`, ok: !err } : c
            )
          );
        };
        if (f.type === "enum") {
          const o = f.options ?? [];
          done(o[(o.indexOf(String(cur)) + 1) % o.length]);
        } else if (f.type === "bool") done(!cur);
        else setPanel({ ...p, editing: true, msg: undefined, buf: f.type === "secret" ? "" : String(cur ?? "") });
        return;
      }
      if (ch === "r") {
        const def =
          f.scope === "config"
            ? (DEFAULT_CONFIG as Record<string, unknown>)[f.key]
            : f.key === "permission"
              ? "ask"
              : f.key === "port"
                ? 3000
                : f.key === "host"
                  ? "127.0.0.1"
                  : "";
        void applyField(f, def).then(() =>
          setPanel((c) => (c && c.type === "config" ? { ...c, msg: `${f.label} -> default`, ok: true } : c))
        );
        return;
      }
      return;
    }
    if (p.type === "mcp") {
      if (key.escape || ch === "q") {
        setPanel(null);
        return;
      }
      const reload = async (): Promise<void> => {
        try {
          const d = await fetchMcpStatus();
          setPanel({ type: "mcp", sel: Math.min(p.sel, Math.max(0, d.servers.length - 1)), servers: d.servers, loading: false });
        } catch {
          /* ignore */
        }
      };
      if (key.upArrow) {
        setPanel({ ...p, sel: Math.max(0, p.sel - 1) });
        return;
      }
      if (key.downArrow) {
        setPanel({ ...p, sel: Math.min(Math.max(0, p.servers.length - 1), p.sel + 1) });
        return;
      }
      const s = p.servers[p.sel];
      if (!s) return;
      if (key.return || ch === " ") {
        void toggleMcp(s.name, s.status === "disabled").then(reload);
        return;
      }
      if (ch === "r") {
        setPanel({ ...p, loading: true });
        void reconnectMcp(s.name).then(reload);
        return;
      }
      return;
    }
    if (key.escape || ch === "q") {
      setPanel(null);
      return;
    }
    if ((ch === "x" || ch === "d") && p.kind === "resume") {
      const it = p.items[p.sel];
      if (!it) return;
      if (dropSessionFile(it.value)) {
        const rest = p.items.filter((x) => x.value !== it.value);
        refreshSessions();
        if (!rest.length) {
          setPanel(null);
          note("Deleted session.");
        } else {
          setPanel({ ...p, items: rest, sel: Math.min(p.sel, rest.length - 1) });
        }
      } else {
        note("Could not delete that session.", "error");
      }
      return;
    }
    if (key.upArrow) {
      setPanel({ ...p, sel: (p.sel - 1 + p.items.length) % p.items.length });
      return;
    }
    if (key.downArrow) {
      setPanel({ ...p, sel: (p.sel + 1) % p.items.length });
      return;
    }
    if (key.return) {
      const it = p.items[p.sel];
      if (!it) return;
      if (p.kind === "model") {
        setPanel(null);
        void setByKey("model", it.value);
      } else openSession(it.value);
    }
  }

  const main = panel ? (
    <Panel
      width={chatW}
      height={mainH}
      title={panel.type === "config" ? "Settings (saved to settings.json)" : panel.type === "mcp" ? "MCP servers" : panel.title}
      footer={
        panel.type === "config"
          ? panel.editing
            ? "Type a value · Enter saves · Esc cancels"
            : "Up/Down pick · Enter/Space change/edit · r default · Esc closes   (R) = restart needed"
          : panel.type === "mcp"
            ? "Up/Down pick · Enter enable/disable · r reconnect · Esc closes · add: /mcp add <name> <command|url>"
            : panel.kind === "resume"
              ? "Up/Down pick · Enter opens · x delete · Esc closes"
              : "Up/Down pick · Enter opens · Esc closes"
      }
    >
      {panel.type === "config" && (
        <ConfigRows fields={FIELDS} values={fieldValues()} sel={panel.sel} editing={panel.editing} editBuf={panel.buf} width={chatW - 4} rows={Math.max(3, mainH - 7)} msg={panel.msg} ok={panel.ok} />
      )}
      {panel.type === "mcp" &&
        (panel.loading ? <Text>Loading…</Text> : <McpRows servers={panel.servers} sel={panel.sel} />)}
      {panel.type === "list" &&
        panel.items.map((it, i) => (
          <Text key={it.value} wrap="truncate-end">
            {i === panel.sel ? "› " : "  "}
            {it.label}
          </Text>
        ))}
    </Panel>
  ) : (
    <ChatView width={chatW} height={mainH} lines={lines} scroll={scroll} frame={frame} status={running ? status || "Working…" : null} />
  );

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Header width={cols} version={version} />
      <Box flexDirection="row" width={cols} height={mainH}>
        {showSide && (
          <Sidebar width={SIDEBAR_W} height={mainH} sessions={filtered} currentId={sid.current} query={query} searching={searching} sel={sideSel} />
        )}
        {main}
      </Box>
      {sugAll.length > 0 && <Suggestions items={sugAll} sel={Math.min(sugSel, sugAll.length - 1)} width={cols} />}
      {pending ? (
        <PermissionBox width={cols} type={pending.type} message={pending.message} />
      ) : isTTY ? (
        <InputBox
          width={cols}
          value={ed.v}
          cursor={ed.c}
          focused={!panel && !searching}
          label="› "
          busy={running}
          placeholder={running ? "running… (Esc to stop)" : "Type a message, /command or !shell"}
        />
      ) : (
        <Box borderStyle="round" paddingX={1}>
          <Text>Needs an interactive terminal (TTY). Run fanluc in Windows Terminal/PowerShell, or fanluc --no-tui.</Text>
        </Box>
      )}
      <StatusBar
        width={cols}
        left={
          <Text>
            <Text>{config.apiUrl ? "●" : "○"}</Text> {config.model || "model?"} · {permission} · {path.basename(workspace) || workspace}
          </Text>
        }
        right="Shift+Tab permission · /help"
      />
    </Box>
  );
}

function blocksSafe(idx: number, all: ChatEntry[], width: number, expanded: Set<string>): string | null {
  const { blocks } = buildLines(all, { width: width - 2, expanded });
  return blocks.length ? blocks[Math.min(idx, blocks.length - 1)] : null;
}
