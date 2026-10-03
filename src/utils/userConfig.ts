// Per-browser config (localStorage). Nothing here needs server files or env.
import { kv } from "./kv";
const K_MCP = "fanluc_mcp_user_servers";
const K_SX = "fanluc_searxng_url";

export interface UserMcpServer {
  name: string;
  url: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

export function getUserMcpServers(): UserMcpServer[] {
  try {
    const v = JSON.parse(kv.getItem(K_MCP) || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
export function saveUserMcpServers(list: UserMcpServer[]) {
  try { kv.setItem(K_MCP, JSON.stringify(list)); } catch {}
}
export function getSearxngUrl(): string {
  try { return (kv.getItem(K_SX) || "").trim(); } catch { return ""; }
}
export function setSearxngUrl(u: string) {
  try { kv.setItem(K_SX, u.trim()); } catch {}
}
