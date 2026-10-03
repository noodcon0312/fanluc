import fs from "fs";
import path from "path";
import type { SessionFile, SessionMeta } from "./types.js";

const dirOf = (configDir: string): string => path.join(configDir, "sessions");
const safeId = (id: string): string => id.replace(/[^a-zA-Z0-9_-]/g, "");

export function newSessionId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function saveSession(configDir: string, s: SessionFile): void {
  try {
    fs.mkdirSync(dirOf(configDir), { recursive: true });
    const slim = { ...s, entries: s.entries.map((e) => (e.kind === "assistant" ? { ...e, live: false } : e)) };
    fs.writeFileSync(path.join(dirOf(configDir), `${safeId(s.id)}.json`), JSON.stringify(slim), "utf-8");
  } catch {
    /* ignore */
  }
}

export function loadSession(configDir: string, id: string): SessionFile | null {
  try {
    const raw = fs.readFileSync(path.join(dirOf(configDir), `${safeId(id)}.json`), "utf-8").replace(/^\uFEFF/, "");
    const j = JSON.parse(raw);
    return j && Array.isArray(j.entries) ? (j as SessionFile) : null;
  } catch {
    return null;
  }
}

export function listSessions(configDir: string, workspace: string): SessionMeta[] {
  const out: SessionMeta[] = [];
  try {
    for (const f of fs.readdirSync(dirOf(configDir))) {
      if (!f.endsWith(".json")) continue;
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dirOf(configDir), f), "utf-8").replace(/^\uFEFF/, ""));
        if (j.workspace === workspace)
          out.push({ id: j.id, title: j.title || "(untitled)", updatedAt: j.updatedAt || 0, workspace: j.workspace });
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteSession(configDir: string, id: string): boolean {
  try {
    fs.unlinkSync(path.join(dirOf(configDir), `${safeId(id)}.json`));
    return true;
  } catch {
    return false;
  }
}

export function relTime(ts: number): string {
  const d = Math.max(0, Date.now() - ts);
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
