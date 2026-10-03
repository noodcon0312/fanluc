#!/usr/bin/env node
import path from "path";
import fs from "fs";
import os from "os";
import { spawn, exec } from "child_process";
import type { StdioOptions } from "child_process";
import {
  getConfigDir,
  ensureConfigDir,
  loadSettings,
  saveSettings,
  ensureMcpJson,
  getWorkspaceDir,
  loadFanlucMd,
  type PermissionMode,
  PERMISSION_DESCRIPTIONS,
} from "./config.js";

const PKG = (() => {
  try {
    const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
    const pkgPath = path.join(here, "..", "..", "package.json");
    for (const p of [pkgPath, path.join(process.cwd(), "package.json"), path.join(path.dirname(process.argv[1] ?? ""), "..", "package.json")]) {
      if (fs.existsSync(p)) {
        const j = JSON.parse(fs.readFileSync(p, "utf-8"));
        if (j.name) return j;
      }
    }
  } catch {
    /* ignore */
  }
  return { version: "0.0.0", name: "fanluc" };
})();

function printHelp(): void {
  console.log(`
fanluc - terminal tool like Claude Code / opencode (web UI runs alongside)

Usage:
  fanluc [options] [workspace]
  fanluc --help
  fanluc --version

Options:
  -p, --port <n>       Port to listen on (default from settings or 3000)
  --host <host>        Host to bind (default 127.0.0.1)
  --no-open            Don't auto-open the browser
  --tui                Force TUI (default: auto when attached to a TTY)
  --no-tui, --web      No TUI, server + browser only
  --permission <mode>  Permission mode: ask | autoEdit | readOnly
                       (ask: confirm every time, autoEdit: auto-allow file
                       writes, readOnly: read only)

Config:
  Windows: %APPDATA%\\fanluc\\  (e.g. C:\\Users\\${os.userInfo().username}\\AppData\\Roaming\\fanluc)
  Linux/mac: ~/.config/fanluc/
    - settings.json  { permission, port, ... }
    - mcp.json       { mcpServers: {...} }

Workspace:
  The current directory is the workspace. A FANLUC.md file in the
  workspace is auto-loaded into the system prompt.

Permissions (3 modes):
  ask      = ${PERMISSION_DESCRIPTIONS.ask}
  autoEdit = ${PERMISSION_DESCRIPTIONS.autoEdit}
  readOnly = ${PERMISSION_DESCRIPTIONS.readOnly}

Examples:
  fanluc
  fanluc --port 3001 --permission autoEdit
  fanluc D:\\my-project
  fanluc --no-open

Web UI: http://localhost:<port>
`);
}

function printVersion(): void {
  console.log(PKG.version || "0.0.0");
}

interface CliArgs {
  port?: number;
  host?: string;
  noOpen: boolean;
  noTui: boolean;
  tui: boolean;
  permission?: PermissionMode;
  help: boolean;
  version: boolean;
  workspace?: string;
  extra: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { noOpen: false, noTui: false, tui: false, help: false, version: false, extra: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--version" || a === "-v") out.version = true;
    else if (a === "--no-open") out.noOpen = true;
    else if (a === "--port" || a === "-p") {
      const n = parseInt(argv[++i], 10);
      if (!isNaN(n)) out.port = n;
    } else if (a.startsWith("--port=")) {
      const n = parseInt(a.split("=")[1], 10);
      if (!isNaN(n)) out.port = n;
    } else if (a === "--host") {
      out.host = argv[++i];
    } else if (a.startsWith("--host=")) {
      out.host = a.split("=")[1];
    } else if (a === "--permission") {
      const v = argv[++i] as PermissionMode;
      if (["ask", "autoEdit", "readOnly"].includes(v)) out.permission = v;
    } else if (a.startsWith("--permission=")) {
      const v = a.split("=")[1] as PermissionMode;
      if (["ask", "autoEdit", "readOnly"].includes(v)) out.permission = v;
    } else if (a === "--tui") out.tui = true;
    else if (a === "--no-tui" || a === "--web") out.noTui = true;
    else if (a.startsWith("-") && a !== "-") {
      out.extra.push(a);
    } else if (!a.startsWith("-") && !out.workspace) {
      out.workspace = a;
    } else {
      out.extra.push(a);
    }
  }
  return out;
}

function openBrowser(url: string): void {
  if (process.platform === "win32") {
    exec(`start "" "${url}"`, (err) => {
      if (err) {
        exec(`powershell -NoProfile -Command "Start-Process '${url}'"`, (e2) => {
          if (e2) console.warn(`[fanluc] Failed to open browser: ${e2.message}. Open manually: ${url}`);
          else console.log(`[fanluc] Opened ${url} via PowerShell`);
        });
      } else {
        console.log(`[fanluc] Opened ${url}`);
      }
    });
  } else if (process.platform === "darwin") {
    exec(`open "${url}"`, (err) => {
      if (err) console.warn(`[fanluc] Failed to open browser: ${err.message}. Open manually: ${url}`);
      else console.log(`[fanluc] Opened ${url}`);
    });
  } else {
    exec(`xdg-open "${url}"`, (err) => {
      if (err) console.warn(`[fanluc] Failed to open browser: ${err.message}. Open manually: ${url}`);
      else console.log(`[fanluc] Opened ${url}`);
    });
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (args.version) {
    printVersion();
    process.exit(0);
  }

  const configDir = getConfigDir();
  ensureConfigDir(configDir);
  const settings = loadSettings(configDir);
  if (args.permission) {
    settings.permission = args.permission;
    saveSettings(settings, configDir);
    console.log(`[fanluc] Permission set to ${settings.permission} (saved to ${path.join(configDir, "settings.json")})`);
  }
  if (args.port) settings.port = args.port;
  if (args.host) settings.host = args.host as string;
  ensureMcpJson(configDir);

  function getInstallDir(): string {
    try {
      const urlPath = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
      let dir = path.dirname(urlPath);
      try {
        dir = decodeURIComponent(dir);
      } catch {
        /* ignore */
      }
      if (dir.endsWith(`${path.sep}dist`)) return path.dirname(dir);
      if (dir.includes(`${path.sep}src${path.sep}cli`) || dir.endsWith("src/cli")) {
        return path.resolve(dir, "../..");
      }
      const candidate = path.resolve(dir, "../..");
      if (fs.existsSync(path.join(candidate, "package.json")) && fs.existsSync(path.join(candidate, "server.ts"))) {
        return candidate;
      }
      const argvDir = path.dirname(process.argv[1] ?? "");
      if (argvDir && fs.existsSync(path.join(argvDir, "../package.json"))) {
        return path.resolve(argvDir, "..");
      }
      return candidate;
    } catch {
      return process.cwd();
    }
  }
  const installDir = getInstallDir();

  let workspace = getWorkspaceDir();
  if (args.workspace) {
    const resolved = path.resolve(args.workspace);
    try {
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        console.error(`[fanluc] Workspace path is not a directory: ${resolved}`);
        process.exit(1);
      }
      workspace = resolved;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[fanluc] Workspace not found: ${resolved} - ${msg}`);
      process.exit(1);
    }
  } else {
    try {
      workspace = process.cwd();
    } catch {
      /* ignore */
    }
  }

  const fanlucMd = loadFanlucMd(workspace);
  const mcpPath = path.join(configDir, "mcp.json");
  const settingsPath = path.join(configDir, "settings.json");

  console.log(`[fanluc] Install dir: ${installDir}`);
  console.log(`[fanluc] Config dir : ${configDir}`);
  console.log(`[fanluc]  - settings: ${settingsPath} (permission=${settings.permission})`);
  console.log(`[fanluc]  - mcp     : ${mcpPath}`);
  console.log(`[fanluc] Workspace : ${workspace}`);
  if (fanlucMd) {
    console.log(`[fanluc] FANLUC.md  : ${fanlucMd.path} (${fanlucMd.content.length} chars, injected into system prompt)`);
  } else {
    console.log(`[fanluc] FANLUC.md  : (none) - create ${path.join(workspace, "FANLUC.md")} to auto-inject`);
  }
  console.log(`[fanluc] Permission: ${settings.permission} - ${PERMISSION_DESCRIPTIONS[settings.permission]}`);

  const port = settings.port || 3000;
  const host = (settings.host as string) || "127.0.0.1";
  const url = `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    HOST: host,
    FANLUC_WORKSPACE: workspace,
    FANLUC_CONFIG_DIR: configDir,
    FANLUC_PERMISSION: settings.permission,
    FANLUC_MD_PATH: fanlucMd?.path || "",
  };

  const serverCjs = path.join(installDir, "dist", "server.cjs");
  const serverTs = path.join(installDir, "server.ts");
  let serverEntry: string | null = null;
  if (fs.existsSync(serverCjs)) {
    serverEntry = serverCjs;
  } else if (fs.existsSync(serverTs)) {
    console.error(`[fanluc] dist/server.cjs not found at ${serverCjs}`);
    console.error(`[fanluc] Run 'npm run build:all' in ${installDir} first.`);
    process.exit(1);
  }
  if (!serverEntry) {
    console.error(`[fanluc] Cannot locate server entry in installDir ${installDir}`);
    process.exit(1);
  }

  console.log(`[fanluc] Starting server: ${serverEntry} on ${url} ...`);
  console.log(`[fanluc] (installDir=${installDir}, workspace=${workspace})`);

  const shouldUseTui = !args.noTui && (args.tui || !!process.stdout.isTTY);
  let serverStdio: StdioOptions = "inherit";
  if (shouldUseTui) {
    try {
      const cfgDir = getConfigDir();
      fs.mkdirSync(cfgDir, { recursive: true });
      const serverLogPath = path.join(cfgDir, "server.log");
      const fd = fs.openSync(serverLogPath, "w");
      serverStdio = ["ignore", fd, fd];
      process.env.FANLUC_SERVER_LOG = serverLogPath;
    } catch {
      serverStdio = "inherit";
    }
  }
  const activeChild = spawn(process.execPath, [serverEntry], {
    env,
    stdio: serverStdio,
    cwd: installDir,
  });
  activeChild.on("error", (e: Error) => {
    console.error(`[fanluc] Server spawn error: ${e.message}`);
    process.exit(1);
  });

  const shouldOpenBrowser = !args.noOpen && !shouldUseTui;
  if (shouldOpenBrowser) {
    setTimeout(() => {
      console.log(`[fanluc] Opening ${url} ...`);
      openBrowser(url);
    }, 1500);
  } else if (shouldUseTui) {
    console.log(`[fanluc] TUI enabled - browser not auto-opened (use --web or --no-tui to open it). Web UI: ${url}`);
  } else {
    console.log(`[fanluc] Auto-open disabled (--no-open). Open manually: ${url}`);
  }

  for (const sig of ["SIGINT", "SIGTERM"] as NodeJS.Signals[]) {
    process.on(sig, () => {
      console.log(`\n[fanluc] Received ${sig}, shutting down...`);
      try {
        activeChild.kill(sig);
      } catch {
        /* ignore */
      }
      setTimeout(() => process.exit(0), 800);
    });
  }
  activeChild.on("exit", (code: number | null, signal: string | null) => {
    if (signal) {
      console.log(`[fanluc] Server exited via signal ${signal}`);
      process.exit(1);
    }
    console.log(`[fanluc] Server exited with code ${code}`);
    if (!shouldUseTui) process.exit(code ?? 0);
  });

  if (shouldUseTui) {
    await new Promise((r) => setTimeout(r, 1800));
    if (activeChild.exitCode !== null) {
      console.error("[fanluc] Server failed to start, TUI not launched");
      return;
    }
    console.log(`[fanluc] Starting TUI... (workspace: ${workspace}, FANLUC.md: ${fanlucMd ? fanlucMd.path : "none"})`);
    try {
      const tuiPath = path.join(installDir, "dist", "tui.js");
      if (!fs.existsSync(tuiPath)) {
        console.error(`[fanluc] TUI not built at ${tuiPath}. Run 'npm run build:tui' or 'npm run build:all' first.`);
        console.error(`[fanluc] Falling back to browser. Open ${url} manually.`);
        if (!args.noOpen) openBrowser(url);
        return;
      }
      const fileUrl = `file://${tuiPath.replace(/\\/g, "/").replace(/^([A-Z]):/, "/$1:")}`;
      const normalizedUrl = fileUrl.startsWith("file:////") ? fileUrl.replace("file:////", "file:///") : fileUrl;
      const tuiMod = (await import(normalizedUrl)) as {
        startTui?: (...a: unknown[]) => Promise<void>;
        default?: { startTui?: (...a: unknown[]) => Promise<void> } | ((...a: unknown[]) => Promise<void>);
      };
      const startTui =
        tuiMod.startTui ||
        (typeof tuiMod.default === "function" ? tuiMod.default : tuiMod.default?.startTui);
      if (typeof startTui !== "function") throw new Error("startTui not found in dist/tui.js");
      const tuiConfig = {
        apiUrl: (settings.apiUrl as string) || process.env.OPENAI_API_URL || process.env.API_URL || "",
        apiKey: (settings.apiKey as string) || process.env.OPENAI_API_KEY || process.env.API_KEY || "none",
        model: (settings.model as string) || "",
        systemPrompt: (settings.systemPrompt as string) || "",
        temperature: settings.temperature ?? 0.7,
        maxTokens: settings.maxTokens ?? 8000,
        topP: settings.topP ?? 0.95,
        topK: settings.topK ?? 40,
        repeatPenalty: settings.repeatPenalty ?? 1.01,
        reasoningEffort: (settings.reasoningEffort as string) || "high",
        effort: (settings.effort as string) || "fast",
        thinkStartTag: (settings.thinkStartTag as string) || "<think>",
        thinkEndTag: (settings.thinkEndTag as string) || "</think>",
        skills: (settings.skills as unknown[]) || [],
      };
      process.env.FANLUC_VERSION = String(PKG.version || "0.0.0");
      await (startTui as (o: unknown) => Promise<void>)({
        workspace,
        port,
        permission: settings.permission,
        config: tuiConfig,
        onExit: () => {
          try {
            activeChild.kill("SIGTERM");
          } catch {
            /* ignore */
          }
          setTimeout(() => process.exit(0), 500);
        },
      });
    } catch (e: unknown) {
      const err = e as Error;
      console.error(`[fanluc] TUI failed to start: ${err?.message || e}`);
      console.error(err?.stack);
      console.error(`[fanluc] Web UI: ${url}`);
    }
  }
}

main().catch((e) => {
  console.error(`[fanluc] Fatal:`, e);
  process.exit(1);
});
