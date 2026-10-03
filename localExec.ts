// ============================================================================
// localExec.ts — SELF-HOST edition: NO sandbox.
//
//  * Commands run directly on THIS machine, as the user who started the server,
//    with the real PATH / HOME / python / node / git (nothing is jailed).
//  * The working folder ("workspace") is chosen by the user at runtime
//    (like opencode web) and remembered in ~/.fanluc/config.json.
//  * Because there is no sandbox, the API is only reachable from this machine
//    (loopback + Host-header check, see requireLocal). Set ALLOW_REMOTE_EXEC=1
//    ONLY if you understand that it gives remote shell access to this PC.
//
// Env:
//   WORKSPACE_DIR          force a workspace at startup (overrides saved one)
//   FANLUC_HOME            where config.json lives (default ~/.fanluc)
//   FANLUC_SHELL           shell binary override (bash / pwsh / powershell / cmd)
//   FANLUC_UNRESTRICTED=1  also disable the tiny "catastrophic command" guard
//   ALLOW_REMOTE_EXEC=1    disable the local-only guard (dangerous)
//   ALLOWED_HOSTS          extra Host header values allowed, comma separated
//   STRIP_ENV              extra env var names hidden from commands (comma sep.)
// ============================================================================
import type { Express, Request, Response, NextFunction } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import { evaluatePermission, registerPermissionRoutes, removeOversizeNewFiles } from "./permissions";
import { spawn, execFileSync, ChildProcess } from "child_process";

// ---------------------------------------------------------------------------
// Config + workspace state
// ---------------------------------------------------------------------------
const HOME_DIR = process.env.FANLUC_HOME || path.join(os.homedir(), ".fanluc");
const CONFIG_FILE = path.join(HOME_DIR, "config.json");

interface LocalConfig {
  workspace?: string;
  recent?: string[];
}

function readConfig(): LocalConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) || {};
  } catch {
    return {};
  }
}

function writeConfig(cfg: LocalConfig) {
  try {
    fs.mkdirSync(HOME_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8");
  } catch (e: any) {
    console.warn("[workspace] could not save config:", e?.message || e);
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function pickInitialWorkspace(): string {
  const forced = process.env.WORKSPACE_DIR || process.env.WORKSPACE;
  if (forced && isDir(forced)) return path.resolve(forced);
  const saved = readConfig().workspace;
  if (saved && isDir(saved)) return path.resolve(saved);
  const fallback = path.join(process.cwd(), "workspace");
  try {
    fs.mkdirSync(fallback, { recursive: true });
  } catch {}
  return fallback;
}

let currentWorkspace = pickInitialWorkspace();

export function getWorkspace(): string {
  return currentWorkspace;
}

const workspaceListeners: Array<(dir: string) => void> = [];
/** Register a callback fired after the user picks another workspace folder. */
export function onWorkspaceChange(cb: (dir: string) => void) {
  workspaceListeners.push(cb);
}

export function setWorkspace(dir: string): { ok: true; workspace: string } | { ok: false; error: string } {
  if (!dir || typeof dir !== "string") return { ok: false, error: "Missing path" };
  const abs = path.resolve(dir.trim().replace(/^~(?=$|[\\/])/, os.homedir()));
  if (!isDir(abs)) return { ok: false, error: `Folder does not exist: ${abs}` };
  try {
    fs.accessSync(abs, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    return { ok: false, error: `No read/write permission: ${abs}` };
  }
  currentWorkspace = abs;
  const cfg = readConfig();
  const recent = [abs, ...(cfg.recent || []).filter((r) => r !== abs)].filter(isDir).slice(0, 10);
  writeConfig({ workspace: abs, recent });
  console.log(`[workspace] now: ${abs}`);
  for (const cb of workspaceListeners) {
    try {
      cb(abs);
    } catch {}
  }
  return { ok: true, workspace: abs };
}

/** Resolve a user/AI supplied relative path inside the workspace; null if it escapes. */
export function resolveInWorkspace(rel: string): string | null {
  const clean = String(rel || "").trim().replace(/^(\.\/|\/|\\)+/, "");
  const abs = path.resolve(currentWorkspace, clean);
  if (abs === currentWorkspace) return abs;
  return abs.startsWith(currentWorkspace + path.sep) ? abs : null;
}

function agentDir(workspaceId: unknown): string {
  if (!workspaceId || typeof workspaceId !== "string") return currentWorkspace;
  const safeId = workspaceId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  if (!safeId) return currentWorkspace;
  const dir = path.join(currentWorkspace, ".fanluc", "agents", safeId);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
  return dir;
}

// ---------------------------------------------------------------------------
// Shell detection (Linux / macOS / Windows)
// ---------------------------------------------------------------------------
interface ShellInfo {
  bin: string;
  kind: "posix" | "powershell" | "cmd";
  label: string;
  args: (cmd: string) => string[];
}

function which(name: string): string | null {
  try {
    const finder = process.platform === "win32" ? "where" : "which";
    const out = execFileSync(finder, [name], { stdio: ["ignore", "pipe", "ignore"] }).toString().split(/\r?\n/)[0].trim();
    return out || null;
  } catch {
    return null;
  }
}

function shellFromBinary(bin: string): ShellInfo {
  const base = path.basename(bin).toLowerCase();
  if (base.includes("pwsh") || base.includes("powershell")) {
    return {
      bin,
      kind: "powershell",
      label: base.includes("pwsh") ? "PowerShell 7 (pwsh)" : "Windows PowerShell",
      args: (cmd) => ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", cmd],
    };
  }
  if (base === "cmd.exe" || base === "cmd") {
    return { bin, kind: "cmd", label: "cmd.exe", args: (cmd) => ["/d", "/s", "/c", cmd] };
  }
  return { bin, kind: "posix", label: base.includes("bash") ? "bash" : base, args: (cmd) => ["-c", cmd] };
}

function detectShell(): ShellInfo {
  const override = process.env.FANLUC_SHELL;
  if (override) return shellFromBinary(override);
  if (process.platform === "win32") {
    const pf = process.env.ProgramFiles || "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const local = process.env.LOCALAPPDATA || "";
    const gitBash = [
      path.join(pf, "Git", "bin", "bash.exe"),
      path.join(pf86, "Git", "bin", "bash.exe"),
      local && path.join(local, "Programs", "Git", "bin", "bash.exe"),
    ].filter(Boolean) as string[];
    for (const c of gitBash) if (fs.existsSync(c)) return { ...shellFromBinary(c), label: "Git Bash" };
    const pwsh = which("pwsh");
    if (pwsh) return shellFromBinary(pwsh);
    return shellFromBinary(which("powershell") || "powershell.exe");
  }
  const bash = which("bash");
  return shellFromBinary(bash || "/bin/sh");
}

export const SHELL: ShellInfo = detectShell();

export function systemInfo() {
  return {
    platform: process.platform,
    arch: process.arch,
    os: `${os.type()} ${os.release()}`,
    shell: SHELL.label,
    shellKind: SHELL.kind,
    home: os.homedir(),
    workspace: currentWorkspace,
    node: process.version,
    python: which("python3") ? "python3" : which("python") ? "python" : null,
    git: !!which("git"),
  };
}

// ---------------------------------------------------------------------------
// Environment for commands: the REAL environment, minus this app's own secrets
// ---------------------------------------------------------------------------
const STRIP_ENV = new Set(
  ["GEMINI_API_KEY", "TOKEN", "ADMIN_TOKEN", "ACCESS_TOKEN", ...(process.env.STRIP_ENV || "").split(",").map((s) => s.trim())].filter(Boolean)
);

function buildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!STRIP_ENV.has(k)) env[k] = v;
  return {
    ...env,
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    GIT_TERMINAL_PROMPT: "0", // fail instead of hanging on a credential prompt
    GIT_PAGER: "cat",
    PAGER: "cat",
    npm_config_yes: "true",
    DEBIAN_FRONTEND: "noninteractive",
    MPLBACKEND: env.MPLBACKEND || "Agg",
  };
}

// ---------------------------------------------------------------------------
// Tiny guard against catastrophic accidents (NOT a sandbox).
// Everything else (sudo, .env, curl|sh, pip, npm, docker...) is allowed.
// ---------------------------------------------------------------------------
const CATASTROPHIC: { pattern: RegExp; reason: string }[] = [
  { pattern: /\brm\s+(-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+(-[a-z]+\s+)*(--no-preserve-root\s+)?(\/|~|\$HOME|\/\*|~\/\*)\s*(;|&|\||$)/i, reason: "recursive delete of / or home" },
  { pattern: /\bmkfs(\.\w+)?\b/i, reason: "formatting a filesystem" },
  { pattern: /\bdd\b[^\n]*\bof=\/dev\/(sd|nvme|hd|disk|mmcblk)/i, reason: "writing raw to a disk device" },
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&?\s*\}\s*;/, reason: "fork bomb" },
  { pattern: /\bformat\s+[a-z]:/i, reason: "formatting a drive" },
  { pattern: /\b(rd|rmdir)\s+\/s\s+(\/q\s+)?[a-z]:\\?\s*$/i, reason: "deleting a whole drive" },
  { pattern: /\bRemove-Item\b[^\n]*-Recurse[^\n]*\s[a-z]:\\?\s*$/i, reason: "deleting a whole drive" },
];

export function findBlocked(command: string): string | null {
  if (process.env.FANLUC_UNRESTRICTED === "1") return null;
  for (const { pattern, reason } of CATASTROPHIC) if (pattern.test(command)) return reason;
  return null;
}

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------
function killTree(child: ChildProcess) {
  const pid = child.pid;
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
      setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          try {
            child.kill("SIGKILL");
          } catch {}
        }
      }, 2000).unref?.();
    }
  } catch {}
}

const CAN_ULIMIT = process.platform !== "win32" && SHELL.kind === "posix";

function spawnShell(command: string, cwd: string): ChildProcess {
  return spawn(SHELL.bin, SHELL.args(command), {
    cwd,
    env: buildEnv(),
    stdio: ["ignore", "pipe", "pipe"], // no stdin: interactive prompts fail fast instead of hanging
    detached: process.platform !== "win32", // own process group so we can kill the whole tree
    windowsHide: true,
  });
}

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
}

const MAX_CAPTURE = 2 * 1024 * 1024;
const MAX_RETURN = Number(process.env.FANLUC_MAX_RETURN) > 0 ? Number(process.env.FANLUC_MAX_RETURN) : 100000; // chars returned to the model per stream (tail)

function runCommand(command: string, cwd: string, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawnShell(command, cwd);
    } catch (e: any) {
      return resolve({ stdout: "", stderr: `Failed to start shell (${SHELL.bin}): ${e?.message || e}`, exitCode: 127, timedOut: false, truncated: false });
    }
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    const add = (which: "o" | "e", d: Buffer) => {
      const s = d.toString("utf-8");
      if (which === "o") stdout += s;
      else stderr += s;
      if (stdout.length + stderr.length > MAX_CAPTURE) {
        truncated = true;
        stdout = stdout.slice(-MAX_CAPTURE / 2);
        stderr = stderr.slice(-MAX_CAPTURE / 2);
      }
    };
    child.stdout?.on("data", (d) => add("o", d));
    child.stderr?.on("data", (d) => add("e", d));
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + `\n[spawn error: ${err.message}]`, exitCode: 127, timedOut, truncated });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, timedOut, truncated });
    });
  });
}

// ---------------------------------------------------------------------------
// Background jobs
// ---------------------------------------------------------------------------
interface BgJob {
  id: string;
  command: string;
  child: ChildProcess;
  log: string;
  truncated: boolean;
  status: "running" | "exited" | "killed" | "error";
  exitCode: number | null;
  startedAt: number;
  endedAt: number | null;
}
const BG_JOBS = new Map<string, BgJob>();
const BG_MAX_LOG = 300000;
const BG_MAX_CONCURRENT = 20;
const BG_EVICT_MS = 30 * 60 * 1000;
let bgSeq = 0;

function bgAppend(job: BgJob, chunk: string) {
  if (!chunk) return;
  job.log += chunk;
  if (job.log.length > BG_MAX_LOG) {
    job.log = job.log.slice(job.log.length - BG_MAX_LOG);
    job.truncated = true;
  }
}
function bgStatus(job: BgJob): string {
  if (job.status === "exited") return `exited (code ${job.exitCode})`;
  return job.status;
}
function lastLine(text: string): string {
  const lines = text.split("\n").map((l) => l.trimEnd());
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].trim()) return lines[i];
  return "(no output yet)";
}
function bgEvictLater(job: BgJob) {
  setTimeout(() => {
    if (BG_JOBS.get(job.id) === job) BG_JOBS.delete(job.id);
  }, BG_EVICT_MS).unref?.();
}

// Kill every running job when the server exits so dev servers don't linger.
function killAllJobs() {
  for (const j of BG_JOBS.values()) if (j.status === "running") killTree(j.child);
}
process.on("exit", killAllJobs);
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    killAllJobs();
    process.exit(0);
  });
}

// ---------------------------------------------------------------------------
// Local-only guard (because there is no sandbox)
// ---------------------------------------------------------------------------
function isLoopbackAddr(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export function requireLocal(req: Request, res: Response, next: NextFunction) {
  if (process.env.ALLOW_REMOTE_EXEC === "1") return next();
  const ip = String(req.socket?.remoteAddress || "");
  const viaProxy = !!req.headers["x-forwarded-for"] || !!req.headers["x-forwarded-host"]; // ngrok/cloudflared add these
  // Host header check blocks DNS-rebinding attacks from web pages the user visits.
  const host = String(req.headers.host || "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  const extra = (process.env.ALLOWED_HOSTS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const hostOk = host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost") || extra.includes(host);
  if (isLoopbackAddr(ip) && !viaProxy && hostOk) return next();
  return res.status(403).json({
    error: "Local only: running commands / browsing folders is allowed only from the machine running the server (open http://localhost:PORT). Set ALLOW_REMOTE_EXEC=1 to override (dangerous).",
    formattedText: "Blocked: this request did not come from localhost.",
  });
}

// ---------------------------------------------------------------------------
// Workspace file listing (metadata + capped inline content)
// ---------------------------------------------------------------------------
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".hg", ".svn", "dist", "build", "out", ".next", ".nuxt", ".cache", ".venv", "venv", "env",
  "__pycache__", ".pytest_cache", ".mypy_cache", "target", "vendor", ".gradle", ".idea", ".vscode", "coverage", ".turbo", ".fanluc",
]);
const BINARY_EXT = new Set([
  "zip", "gz", "tar", "tgz", "rar", "7z", "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "pdf", "exe", "dll", "so", "dylib", "bin", "apk", "iso",
  "mp3", "mp4", "mkv", "avi", "mov", "wav", "flac", "ogg", "woff", "woff2", "ttf", "otf", "class", "jar", "pyc", "sqlite", "db",
]);
const MAX_FILES = 5000;
const envNum = (k: string, d: number) => { const n = Number(process.env[k]); return Number.isFinite(n) && n > 0 ? n : d; };
const VIEW_LIMIT = 70 * 1024 * 1024; // non-HTML files above this are not sent to the viewer (download instead)
const MAX_INLINE_FILE = 256 * 1024 * 1024; // technical guard only (Node cannot hold bigger strings); no user-facing cap

async function listWorkspaceFiles(root: string) {
  const files: Record<string, any> = {};
  let count = 0;
  let truncated = false;

  async function walk(dir: string, rel: string) {
    if (truncated) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (truncated) return;
      const name = entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
        await walk(path.join(dir, name), rel ? `${rel}/${name}` : name);
      } else if (entry.isFile()) {
        if (name.startsWith(".")) continue;
        if (count >= MAX_FILES) {
          truncated = true;
          return;
        }
        const full = path.join(dir, name);
        const relPath = rel ? `${rel}/${name}` : name;
        let st: fs.Stats;
        try {
          st = await fs.promises.stat(full);
        } catch {
          continue;
        }
        const ext = name.split(".").pop()?.toLowerCase() || "";
        let content: string;
        if (BINARY_EXT.has(ext)) content = `[Binary File: ${name} (${(st.size / 1024).toFixed(1)} KB)]`;
        else if (st.size > MAX_INLINE_FILE || (st.size > VIEW_LIMIT && !/\.html?$/i.test(name)))
          content = `[Large File: ${(st.size / 1024).toFixed(1)} KB — read it with run_cmd (cat / sed -n)]`;
        else {
          try {
            content = await fs.promises.readFile(full, "utf-8");
          } catch {
            content = `[Unreadable File: ${(st.size / 1024).toFixed(1)} KB]`;
          }
        }
        files[relPath] = { path: relPath, name, content, size: st.size, language: ext, updatedAt: st.mtimeMs };
        count++;
      }
    }
  }
  await walk(root, "");
  return { files, truncated, count };
}


// ---- on-disk key/value store (replaces the browser's localStorage) ------------------------
const KV_FILE = path.join(os.homedir(), ".fanluc", "state.json");
let kvCache: Record<string, string> | null = null;
function kvLoad(): Record<string, string> {
  if (kvCache) return kvCache;
  try {
    kvCache = JSON.parse(fs.readFileSync(KV_FILE, "utf-8")) || {};
  } catch {
    kvCache = {};
  }
  return kvCache!;
}
let kvTimer: NodeJS.Timeout | null = null;
function kvSave(data: Record<string, string>) {
  kvCache = data;
  if (kvTimer) return;
  kvTimer = setTimeout(() => {
    kvTimer = null;
    try {
      fs.mkdirSync(path.dirname(KV_FILE), { recursive: true });
      const tmp = KV_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(kvCache), { mode: 0o600 });
      fs.renameSync(tmp, KV_FILE);
    } catch (e) {
      console.warn("[kv] save failed:", e);
    }
  }, 300);
}
process.on("exit", () => {
  if (kvTimer) {
    try {
      fs.mkdirSync(path.dirname(KV_FILE), { recursive: true });
      fs.writeFileSync(KV_FILE, JSON.stringify(kvCache), { mode: 0o600 });
    } catch {}
  }
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
function clampTimeout(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 120000;
  return Math.min(600000, Math.max(1000, n));
}

function listRoots(): { name: string; path: string }[] {
  const roots: { name: string; path: string }[] = [];
  if (process.platform === "win32") {
    for (let c = 65; c <= 90; c++) {
      const d = `${String.fromCharCode(c)}:\\`;
      try {
        if (fs.existsSync(d)) roots.push({ name: d, path: d });
      } catch {}
    }
  } else {
    roots.push({ name: "/", path: "/" });
  }
  return roots;
}

export function registerLocalRoutes(app: Express) {
  registerPermissionRoutes(app, requireLocal);
  // ---- workspace -----------------------------------------------------------
  app.get("/api/workspace", requireLocal, (_req, res) => {
    const cfg = readConfig();
    res.json({
      workspace: currentWorkspace,
      name: path.basename(currentWorkspace) || currentWorkspace,
      recent: (cfg.recent || []).filter(isDir),
      home: os.homedir(),
      roots: listRoots(),
      system: systemInfo(),
    });
  });

  app.post("/api/workspace/set", requireLocal, (req, res) => {
    const r = setWorkspace(String(req.body?.path || ""));
    if (!r.ok) return res.status(400).json(r);
    return res.json({ ok: true, workspace: r.workspace, name: path.basename(r.workspace) || r.workspace });
  });

  // Folder browser for the picker (directories only)
  app.get("/api/fs/browse", requireLocal, async (req, res) => {
    try {
      const raw = String(req.query.path || "").trim();
      const target = path.resolve(raw ? raw.replace(/^~(?=$|[\\/])/, os.homedir()) : os.homedir());
      if (!isDir(target)) return res.status(404).json({ error: `Not a folder: ${target}` });
      const showHidden = req.query.hidden === "1";
      let entries: fs.Dirent[] = [];
      try {
        entries = await fs.promises.readdir(target, { withFileTypes: true });
      } catch (e: any) {
        return res.status(403).json({ error: e?.message || "Cannot read folder" });
      }
      const dirs = entries
        .filter((e) => {
          if (!e.isDirectory() && !(e.isSymbolicLink() && isDir(path.join(target, e.name)))) return false;
          return showHidden || !e.name.startsWith(".");
        })
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
      const parent = path.dirname(target);
      res.json({
        path: target,
        parent: parent === target ? null : parent,
        dirs,
        fileCount: entries.filter((e) => e.isFile()).length,
        roots: listRoots(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "browse failed" });
    }
  });

  app.post("/api/fs/mkdir", requireLocal, async (req, res) => {
    try {
      const parent = path.resolve(String(req.body?.parent || ""));
      const name = String(req.body?.name || "").trim();
      if (!name || /[\\/:*?"<>|]/.test(name) || name === "." || name === "..") return res.status(400).json({ error: "Invalid folder name" });
      if (!isDir(parent)) return res.status(404).json({ error: "Parent folder not found" });
      const full = path.join(parent, name);
      await fs.promises.mkdir(full, { recursive: false });
      res.json({ ok: true, path: full });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "mkdir failed" });
    }
  });

  app.get("/api/system-info", requireLocal, (_req, res) => res.json(systemInfo()));

  // ---- run_cmd ---------------------------------------------------------------
  app.post("/api/run-cmd", requireLocal, async (req, res) => {
    if (process.env.DISABLE_RUN_CMD === "1") {
      const msg = "run_cmd is disabled on this server (DISABLE_RUN_CMD=1).";
      return res.json({ stdout: "", stderr: msg, formattedText: msg, blocked: true });
    }
    const { command, workspaceId, timeoutMs } = req.body || {};
    if (!command || typeof command !== "string" || !command.trim()) {
      return res.status(400).json({ error: "Missing command", formattedText: "Error: missing command" });
    }
    const trimmed = command.trim();
    const blocked = findBlocked(trimmed);
    if (blocked) {
      const msg = `Command blocked as catastrophic: ${blocked}. (Set FANLUC_UNRESTRICTED=1 to disable this guard.)`;
      return res.json({ stdout: "", stderr: msg, formattedText: msg, blocked: true });
    }
    const cwd = agentDir(workspaceId);
    const limit = clampTimeout(timeoutMs);
    const ev = await evaluatePermission(trimmed, cwd, { canUlimit: CAN_ULIMIT });
    if (!ev.ok) {
      return res.json({ stdout: "", stderr: ev.message, formattedText: `$ ${trimmed}\n${ev.message}`, blocked: true });
    }
    const startedAt = Date.now();
    const toRun = ev.ulimitMb ? `ulimit -f ${Math.max(1, Math.floor(ev.ulimitMb * 1024))}; ${trimmed}` : trimmed;
    const r = await runCommand(toRun, cwd, limit);
    const out = r.stdout.slice(-MAX_RETURN);
    const errOut = r.stderr.slice(-MAX_RETURN);
    const notes: string[] = [];
    if (r.truncated || r.stdout.length > MAX_RETURN || r.stderr.length > MAX_RETURN) notes.push("[output truncated — showing the end]");
    if (ev.ulimitMb && r.exitCode === 153) notes.push("[stopped: a file would exceed the user's max file-size limit (permission settings)]");
    if (ev.scanBytes) {
      const removed = await removeOversizeNewFiles(cwd, startedAt, ev.scanBytes);
      if (removed.length) notes.push(`[removed new files over the user's max file-size limit: ${removed.join(", ")}]`);
    }
    if (r.timedOut) notes.push(`[timed out after ${Math.round(limit / 1000)}s and was killed — use run_cmd_bg for long-running commands]`);
    const body = `${out}${errOut ? (out ? "\n" : "") + errOut : ""}`.trim() || "(no output)";
    const formattedText = `$ ${trimmed}\n${body}${notes.length ? "\n" + notes.join("\n") : ""}${
      !r.timedOut && r.exitCode ? `\n[exit code ${r.exitCode}]` : ""
    }`;
    return res.json({ stdout: out, stderr: errOut, exitCode: r.exitCode, timedOut: r.timedOut, formattedText });
  });

  // ---- background jobs ---------------------------------------------------------
  app.post("/api/run-cmd-bg", requireLocal, async (req, res) => {
    if (process.env.DISABLE_RUN_CMD === "1") {
      return res.json({ id: null, formattedText: "run_cmd_bg is disabled on this server.", blocked: true });
    }
    const { command, workspaceId } = req.body || {};
    if (!command || typeof command !== "string" || !command.trim()) {
      return res.status(400).json({ error: "Missing command", formattedText: "Error: missing command" });
    }
    const trimmed = command.trim();
    const blocked = findBlocked(trimmed);
    if (blocked) return res.json({ id: null, formattedText: `Command blocked as catastrophic: ${blocked}.`, blocked: true });
    const ev = await evaluatePermission(trimmed, agentDir(workspaceId), { canUlimit: CAN_ULIMIT });
    if (!ev.ok) return res.json({ id: null, formattedText: `$ ${trimmed}\n${ev.message}`, blocked: true });
    const running = [...BG_JOBS.values()].filter((j) => j.status === "running").length;
    if (running >= BG_MAX_CONCURRENT) {
      return res.json({ id: null, formattedText: `Too many background commands running (max ${BG_MAX_CONCURRENT}). Kill one with kill_cmd_bg first.`, blocked: true });
    }
    let child: ChildProcess;
    try {
      child = spawnShell(ev.ulimitMb ? `ulimit -f ${Math.max(1, Math.floor(ev.ulimitMb * 1024))}; ${trimmed}` : trimmed, agentDir(workspaceId));
    } catch (e: any) {
      return res.json({ id: null, formattedText: `Failed to start background command: ${e?.message || e}`, blocked: true });
    }
    const id = `bg${(++bgSeq).toString(36)}${Date.now().toString(36).slice(-4)}`;
    const job: BgJob = { id, command: trimmed, child, log: "", truncated: false, status: "running", exitCode: null, startedAt: Date.now(), endedAt: null };
    BG_JOBS.set(id, job);
    child.stdout?.on("data", (d) => bgAppend(job, d.toString()));
    child.stderr?.on("data", (d) => bgAppend(job, d.toString()));
    child.on("error", (err) => {
      bgAppend(job, `\n[process error: ${err.message}]\n`);
      job.status = "error";
      job.endedAt = Date.now();
      bgEvictLater(job);
    });
    child.on("exit", (code, signal) => {
      job.exitCode = code;
      job.endedAt = Date.now();
      if (job.status === "running") job.status = "exited";
      if (signal) bgAppend(job, `\n[terminated by signal ${signal}]\n`);
      bgEvictLater(job);
    });
    return res.json({ id, formattedText: `Started background command ${id}: ${trimmed}` });
  });

  app.post("/api/kill-cmd-bg", requireLocal, (req, res) => {
    const { id } = req.body || {};
    const job = id && BG_JOBS.get(id);
    if (!job) return res.json({ formattedText: `No background command with id "${id}" (it may have finished and been cleaned up).` });
    if (job.status !== "running") return res.json({ formattedText: `${id} is not running (status: ${bgStatus(job)}).` });
    job.status = "killed";
    killTree(job.child);
    return res.json({ formattedText: `Killed ${id} (${job.command}).` });
  });

  app.post("/api/read-cmd-bg-log", requireLocal, (req, res) => {
    const { id, offset, limit } = req.body || {};
    const job = id && BG_JOBS.get(id);
    if (!job) return res.json({ formattedText: `No background command with id "${id}" (it may have finished and been cleaned up).` });
    const lines = job.log.split("\n");
    const off = Math.max(1, parseInt(offset, 10) || 1);
    const lim = Math.max(1, Math.min(2000, parseInt(limit, 10) || 200));
    const slice = lines.slice(off - 1, off - 1 + lim);
    const header = `[${id}] status: ${bgStatus(job)} | command: ${job.command} | log lines: ${lines.length}${job.truncated ? " (older lines were trimmed)" : ""}`;
    return res.json({ formattedText: `${header}\n${slice.join("\n") || "(nothing at this offset)"}` });
  });

  app.post("/api/list-cmd-bg", requireLocal, (_req, res) => {
    const jobs = [...BG_JOBS.values()].sort((a, b) => a.startedAt - b.startedAt);
    if (!jobs.length) return res.json({ formattedText: "No background commands.", jobs: [] });
    const rows = jobs.map((j) => ({ id: j.id, command: j.command, status: bgStatus(j), lastLogLine: lastLine(j.log) }));
    return res.json({ formattedText: rows.map((r) => `- ${r.id} | ${r.status} | ${r.command}\n  last: ${r.lastLogLine}`).join("\n"), jobs: rows });
  });

  // ---- per-agent folders (inside <workspace>/.fanluc/agents/<id>) ----------------
  app.post("/api/agent-workspace-export", requireLocal, async (req, res) => {
    const safeId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) : "";
    if (!safeId) return res.status(400).json({ error: "Missing workspaceId" });
    const dir = path.join(currentWorkspace, ".fanluc", "agents", safeId);
    if (!fs.existsSync(dir)) return res.status(404).json({ error: "This agent has no workspace files yet." });
    try {
      // Zip with JSZip (already a dependency) so it works on every OS without zip/python.
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const walk = async (d: string, rel: string) => {
        for (const e of await fs.promises.readdir(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) await walk(p, r);
          else if (e.isFile()) zip.file(r, await fs.promises.readFile(p));
        }
      };
      await walk(dir, "");
      const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="agent-${safeId}-workspace.zip"`);
      res.send(buf);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  app.post("/api/agent-workspace-clear", requireLocal, (req, res) => {
    const safeId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) : "";
    if (!safeId) return res.status(400).json({ error: "Missing workspaceId" });
    const dir = path.join(currentWorkspace, ".fanluc", "agents", safeId);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      res.json({ ok: true, formattedText: `Cleared workspace for agent ${safeId}.` });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // install_pack_v1 is gone in the self-host edition (there is no sandbox to prepare).
  app.post("/api/install-pack", (_req, res) => {
    res.json({
      ok: true,
      formattedText:
        "[INSTALL_PACK_V1 STATUS: SUCCESS]\nThis build runs commands directly on the user's machine. There is nothing to install automatically: use run_cmd with the tool's own installer (pip install X, npm i X, winget/brew/apt) when something is missing.",
    });
  });

  // ---- workspace files (UI panel) --------------------------------------------------
  app.post("/api/upload-workspace-file", requireLocal, async (req, res) => {
    try {
      const { name, content, encoding = "utf-8" } = req.body || {};
      if (!name || typeof name !== "string") return res.status(400).json({ error: "Missing file name" });
      const filePath = resolveInWorkspace(name);
      if (!filePath || filePath === currentWorkspace) return res.status(403).json({ error: "Invalid file path outside workspace" });
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      let buffer: Buffer;
      if ((encoding === "base64" || name.toLowerCase().endsWith(".zip")) && typeof content === "string") {
        buffer = Buffer.from(content.includes(",") ? content.split(",")[1] : content, "base64");
      } else if (typeof content === "string") {
        buffer = Buffer.from(content, "utf-8");
      } else {
        buffer = Buffer.from("");
      }
      await fs.promises.writeFile(filePath, buffer);
      const st = await fs.promises.stat(filePath);
      return res.json({ success: true, path: path.relative(currentWorkspace, filePath).split(path.sep).join("/"), name: path.basename(filePath), size: st.size, updatedAt: st.mtimeMs });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Failed to upload workspace file" });
    }
  });

  app.post("/api/delete-workspace-file", requireLocal, async (req, res) => {
    try {
      const p = req.body?.path;
      if (!p || typeof p !== "string") return res.status(400).json({ error: "Missing file path" });
      const target = resolveInWorkspace(p);
      if (!target || target === currentWorkspace) return res.status(403).json({ error: "Invalid file path outside workspace" });
      if (fs.existsSync(target)) await fs.promises.rm(target, { recursive: true, force: true });
      return res.json({ success: true, path: p });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Failed to delete workspace file" });
    }
  });


  // ---- raw upload: streamed straight to disk, NO size limit, no base64 --------------------
  app.post("/api/workspace/upload-raw", requireLocal, async (req, res) => {
    try {
      const rel = String(req.query.path || "");
      if (!rel) return res.status(400).json({ error: "Missing path" });
      const target = resolveInWorkspace(rel);
      if (!target || target === currentWorkspace) return res.status(403).json({ error: "Invalid file path outside workspace" });
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await pipeline(req, fs.createWriteStream(target));
      const st = await fs.promises.stat(target);
      return res.json({ success: true, path: path.relative(currentWorkspace, target).split(path.sep).join("/"), size: st.size, updatedAt: st.mtimeMs });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Upload failed" });
    }
  });

  // ---- reveal a workspace file in the OS file manager (the app runs on the user's own machine) ----
  app.post("/api/workspace/reveal", requireLocal, async (req, res) => {
    try {
      const target = resolveInWorkspace(String(req.body?.path || ""));
      if (!target || !fs.existsSync(target)) return res.status(404).json({ error: "Not found" });
      let bin: string;
      let args: string[];
      if (process.platform === "win32") {
        bin = "explorer.exe";
        args = [`/select,${target}`];
      } else if (process.platform === "darwin") {
        bin = "open";
        args = ["-R", target];
      } else {
        bin = "xdg-open";
        args = [path.dirname(target)];
      }
      const child = spawn(bin, args, { detached: true, stdio: "ignore", windowsHide: false });
      child.on("error", () => {});
      child.unref();
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Could not open folder" });
    }
  });

  // ---- raw download of any workspace file (any size) ---------------------------------------
  app.get("/api/workspace/file", requireLocal, async (req, res) => {
    try {
      const target = resolveInWorkspace(String(req.query.path || ""));
      if (!target || target === currentWorkspace || !fs.existsSync(target)) return res.status(404).json({ error: "Not found" });
      const st = await fs.promises.stat(target);
      if (!st.isFile()) return res.status(400).json({ error: "Not a file" });
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", String(st.size));
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(target))}`);
      fs.createReadStream(target).on("error", () => res.destroy()).pipe(res);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Download failed" });
    }
  });

  // ---- settings / chats / memories: saved on disk instead of the browser's localStorage ------
  app.get("/api/kv", requireLocal, (_req, res) => res.json({ data: kvLoad() }));
  app.post("/api/kv", requireLocal, (req, res) => {
    const { set, remove } = req.body || {};
    const data = kvLoad();
    if (set && typeof set === "object") for (const [k, v] of Object.entries(set)) if (typeof v === "string") data[k] = v;
    if (Array.isArray(remove)) for (const k of remove) delete data[String(k)];
    kvSave(data);
    return res.json({ ok: true });
  });

  app.get("/api/workspace-files", requireLocal, async (_req, res) => {
    try {
      const { files, truncated, count } = await listWorkspaceFiles(currentWorkspace);
      return res.json({ files, truncated, count, workspace: currentWorkspace });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Failed to list workspace files" });
    }
  });
}
