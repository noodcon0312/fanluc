import path from "path";
import fs from "fs";
import os from "os";

export type PermissionMode = "ask" | "autoEdit" | "readOnly";

export const PERMISSION_DESCRIPTIONS: Record<PermissionMode, string> = {
  ask: "Ask every time before writing files or running shell commands",
  autoEdit: "Auto-allow file writes, ask only for shell commands",
  readOnly: "Read only - block all file writes and shell commands",
};

export interface FanlucSettings {
  permission: PermissionMode;
  port?: number;
  host?: string;
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  reasoningEffort?: string;
  effort?: string;
  thinkStartTag?: string;
  thinkEndTag?: string;
  skills?: unknown[];
  searxngUrl?: string;
  [key: string]: unknown;
}

const DEFAULT_SETTINGS: Pick<FanlucSettings, "permission" | "port"> = {
  permission: "ask",
  port: 3000,
};

export function getConfigDir(): string {
  if (process.env.FANLUC_CONFIG_DIR && process.env.FANLUC_CONFIG_DIR.trim()) {
    return process.env.FANLUC_CONFIG_DIR.trim();
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData && appData.trim()) return path.join(appData, "fanluc");
    return path.join(os.homedir(), "AppData", "Roaming", "fanluc");
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.trim()) return path.join(xdg, "fanluc");
  return path.join(os.homedir(), ".config", "fanluc");
}

export function getSettingsPath(configDir?: string): string {
  return path.join(configDir || getConfigDir(), "settings.json");
}

export function getMcpPath(configDir?: string): string {
  return path.join(configDir || getConfigDir(), "mcp.json");
}

export function ensureConfigDir(configDir?: string): string {
  const dir = configDir || getConfigDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.warn(`[fanluc] Failed to create config dir ${dir}:`, e);
  }
  return dir;
}

export function loadSettings(configDir?: string): FanlucSettings {
  const dir = ensureConfigDir(configDir);
  const p = getSettingsPath(dir);
  let parsed: Record<string, unknown> = {};
  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf-8").replace(/^\uFEFF/, "");
      parsed = JSON.parse(raw);
    }
  } catch (e) {
    console.warn(`[fanluc] Failed to parse settings.json:`, e);
  }
  const valid = ["ask", "autoEdit", "readOnly"];
  const permission = valid.includes(parsed.permission as string)
    ? (parsed.permission as PermissionMode)
    : DEFAULT_SETTINGS.permission;
  return { ...DEFAULT_SETTINGS, ...parsed, permission };
}

export function saveSettings(settings: FanlucSettings, configDir?: string): void {
  const dir = ensureConfigDir(configDir);
  const p = getSettingsPath(dir);
  try {
    fs.writeFileSync(p, JSON.stringify(settings, null, 2), "utf-8");
  } catch (e) {
    console.warn(`[fanluc] Failed to write settings.json:`, e);
  }
}

export function ensureMcpJson(configDir?: string): string {
  const dir = ensureConfigDir(configDir);
  const target = getMcpPath(dir);
  if (fs.existsSync(target)) return target;
  try {
    fs.writeFileSync(target, JSON.stringify({ mcpServers: {} }, null, 2), "utf-8");
    console.log(`[fanluc] Created empty mcp.json at ${target}`);
  } catch {
    /* ignore */
  }
  return target;
}

export function getWorkspaceDir(): string {
  if (process.env.FANLUC_WORKSPACE && process.env.FANLUC_WORKSPACE.trim()) {
    return path.resolve(process.env.FANLUC_WORKSPACE.trim());
  }
  return process.cwd();
}

export function findFanlucMd(workspaceDir?: string): string | null {
  const ws = workspaceDir || getWorkspaceDir();
  const candidates = [
    path.join(ws, "FANLUC.md"),
    path.join(ws, "fanluc.md"),
    path.join(ws, ".fanluc", "FANLUC.md"),
    path.join(ws, ".fanluc.md"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

const MAX_FANLUC_MD = 6000;

export function loadFanlucMd(workspaceDir?: string): { path: string; content: string } | null {
  const found = findFanlucMd(workspaceDir);
  if (!found) return null;
  try {
    const raw = fs.readFileSync(found, "utf-8").replace(/^\uFEFF/, "");
    if (raw.length > MAX_FANLUC_MD) {
      console.warn(`[fanluc] FANLUC.md too large (${raw.length} chars), truncating to ${MAX_FANLUC_MD}`);
      return { path: found, content: raw.slice(0, MAX_FANLUC_MD) + "\n\n[... truncated ...]" };
    }
    return { path: found, content: raw };
  } catch (e) {
    console.warn(`[fanluc] Failed to read ${found}:`, e);
    return null;
  }
}
