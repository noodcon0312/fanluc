import React from "react";
import { render } from "ink";
import { TuiApp } from "./app.js";
import { installRelativeFetchShim } from "../core/http.js";
import { kvInit } from "../utils/kv.js";
import { getConfigDir, loadFanlucMd, loadSettings } from "../cli/config.js";
import type { PermissionMode } from "../cli/config.js";
import type { TuiConfig } from "./settings.js";

export interface StartTuiOpts {
  workspace: string;
  port: number;
  permission: PermissionMode;
  config: Partial<TuiConfig>;
  onExit: () => void;
}

export async function startTui(opts: StartTuiOpts): Promise<void> {
  const fanlucMd = loadFanlucMd(opts.workspace);
  process.env.PORT = String(opts.port);
  process.env.FANLUC_API_URL = `http://127.0.0.1:${opts.port}`;
  installRelativeFetchShim(process.env.FANLUC_API_URL);
  try {
    await kvInit();
  } catch {
    /* server state is optional */
  }
  if (typeof (globalThis as Record<string, unknown>).localStorage === "undefined") {
    const mem = new Map<string, string>();
    try {
      const st = loadSettings() as Record<string, unknown>;
      if (st.searxngUrl) mem.set("fanluc_searxng_url", String(st.searxngUrl));
    } catch {
      /* ignore */
    }
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
      setItem: (k: string, v: string) => {
        mem.set(k, String(v));
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    };
  }
  if (!process.stdin.isTTY) {
    console.log(`[fanluc] TUI needs an interactive terminal (TTY) - detected non-TTY.`);
    console.log(`[fanluc] Web UI: http://127.0.0.1:${opts.port} - use --no-tui to hide this message.`);
    console.log(`[fanluc] FANLUC.md: ${fanlucMd ? fanlucMd.path : "(none)"}`);
    console.log(`[fanluc] Type /help in web or run 'fanluc --help' for commands.`);
    return;
  }
  const instance = render(
    <TuiApp
      workspace={opts.workspace}
      fanlucMd={fanlucMd}
      config={opts.config}
      permission={opts.permission}
      port={opts.port}
      onExit={opts.onExit}
    />,
    { alternateScreen: true, incrementalRendering: true, maxFps: 30, exitOnCtrlC: false }
  );
  await instance.waitUntilExit();
}

// Standalone: `node dist/tui.js` (env provided by the CLI wrapper).
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const ws = process.env.FANLUC_WORKSPACE || process.cwd();
  const port = parseInt(process.env.PORT || "3000", 10);
  const perm = (process.env.FANLUC_PERMISSION || "ask") as PermissionMode;
  const dir = getConfigDir();
  void dir;
  let cfg: Partial<TuiConfig> = {
    apiUrl: "",
    apiKey: "",
    model: "",
    systemPrompt: "",
    temperature: 0.7,
    maxTokens: 8000,
    topP: 0.95,
    topK: 40,
    repeatPenalty: 1.01,
    reasoningEffort: "high",
    effort: "fast",
    thinkStartTag: "<think>",
    thinkEndTag: "</think>",
  };
  try {
    cfg = { ...cfg, ...(loadSettings() as Partial<TuiConfig>) };
  } catch {
    /* ignore */
  }
  await startTui({ workspace: ws, port, permission: perm, config: cfg, onExit: () => process.exit(0) });
}
