import { getUserMcpServers } from "./userConfig";
import { kv } from "./kv";
// MCP helper — client bridge to server.ts MCP endpoints
// Security: server only reads mcp.json file; client never sends command/url

export const MCP_CALL_REGEX = /(?:```[a-z]*\s*)?(?:call:)?mcp_call\s*\(\s*([^)]*)\)(?:\s*```)?/gi;
// Also support call_mcp, mcp\.call, server_tool direct? We keep prefix style for now
export const MCP_CALL_ALT_REGEX = /(?:```[a-z]*\s*)?(?:call:)?call_mcp\s*\(\s*([^)]*)\)(?:\s*```)?/gi;

export interface McpCallCommand {
  server: string;
  tool: string;
  args: Record<string, any>;
  fullMatch: string;
}

function parseArgsString(argsStr: string): Record<string, any> {
  // Try JSON-like parsing: handles server="x", tool="y", args={...} or JSON object
  const out: Record<string, any> = {};
  if (!argsStr) return out;
  // Try to extract server, tool, args via regex
  const serverMatch = argsStr.match(/(?:server|name)\s*[:=]\s*["'`]([^"'`]+)["'`]/i);
  const toolMatch = argsStr.match(/(?:tool)\s*[:=]\s*["'`]([^"'`]+)["'`]/i);
  if (serverMatch) out.server = serverMatch[1];
  if (toolMatch) out.tool = toolMatch[1];
  // args: look for args= or arguments= with JSON
  const argsMatch = argsStr.match(/(?:args|arguments)\s*[:=]\s*(\{[\s\S]*\})/);
  if (argsMatch) {
    try {
      // Replace single quotes with double for JSON parse attempt
      let j = argsMatch[1].trim();
      // Naive: allow trailing commas
      j = j.replace(/'/g, '"').replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
      out.args = JSON.parse(j);
    } catch {
      out.args = {};
    }
  } else {
    // Fallback: try to parse whole string as JSON if it looks like JSON
    const trimmed = argsStr.trim();
    if (trimmed.startsWith("{")) {
      try {
        const j = JSON.parse(trimmed.replace(/'/g, '"'));
        if (j.server) out.server = j.server;
        if (j.tool) out.tool = j.tool;
        if (j.args) out.args = j.args;
        if (j.arguments) out.args = j.arguments;
      } catch {}
    }
  }
  // Also support positional: mcp_call("server","tool",{args})
  if (!out.server || !out.tool) {
    const positional = argsStr.split(",").map(s=>s.trim().replace(/^["'`]|["'`]$/g,""));
    if (positional.length >= 2 && !out.server) {
      if (!positional[0].includes(":") && !positional[0].includes("{")) out.server = positional[0].replace(/^["'`]|["'`]$/g,"");
      if (!positional[1].includes("{") && !out.tool) out.tool = positional[1].replace(/^["'`]|["'`]$/g,"");
      if (positional.length >=3) {
        const last = positional.slice(2).join(",");
        try { out.args = JSON.parse(last.replace(/'/g,'"')); } catch { out.args={}; }
      }
    }
  }
  if (!out.args) out.args = {};
  return out;
}

export function extractAllMcpCalls(text: string): McpCallCommand[] {
  if (!text || typeof text !== "string") return [];
  const results: McpCallCommand[] = [];
  const regexes = [MCP_CALL_REGEX, MCP_CALL_ALT_REGEX];
  for (const re of regexes) {
    const regex = new RegExp(re.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const inner = (m[1] || "").trim();
      const parsed = parseArgsString(inner);
      if (!parsed.server || !parsed.tool) continue;
      results.push({ server: parsed.server, tool: parsed.tool, args: parsed.args || {}, fullMatch: m[0] });
    }
  }
  // Also detect server_tool( {...} ) style where server is prefix of known tool? We need server list — handle generically:
  // e.g. fetch_fetch(url="...") — we treat as mcp_call with server=fetch, tool=fetch
  // This regex finds word_word( -> assume first part is server name
  const prefixedRegex = /\b([a-zA-Z0-9_-]+)_([a-zA-Z0-9_-]+)\s*\(\s*(\{[\s\S]*?\}|[^)]*)\s*\)/gi;
  // Only use if no explicit mcp_call found and text contains known server_tool pattern
  // We'll leave this disabled by default to avoid false positives with other tools.
  return results;
}

export function hasMcpCall(text: string): boolean {
  if (!text) return false;
  return MCP_CALL_REGEX.test(text) || MCP_CALL_ALT_REGEX.test(text);
}

export function stripMcpCalls(text: string): string {
  if (!text) return "";
  let out = text.replace(new RegExp(MCP_CALL_REGEX.source, "gi"), "");
  out = out.replace(new RegExp(MCP_CALL_ALT_REGEX.source, "gi"), "");
  return out.trim();
}

export interface McpStatusEntry {
  name: string;
  type: string;
  status: "connected" | "failed" | "disabled" | "connecting";
  toolCount: number;
  tools: any[];
  error?: string | null;
  source?: "server" | "browser";
  command?: string;
  args?: string;
  url?: string;
  headers?: Record<string, string>;
}

export async function fetchMcpStatus(): Promise<{ servers: McpStatusEntry[]; modelTools?: any[] }> {
  let servers: McpStatusEntry[] = [];
  let modelTools: any[] = [];
  try {
    const r = await fetch("/api/mcp/status");
    if (r.ok) {
      const d = await r.json();
      servers = (d.servers || []).map((s: any) => ({ ...s, source: "server" }));
      modelTools = d.modelTools || [];
    }
  } catch {}
  const user = getUserMcpServers();
  if (user.length) {
    const active = user.filter((s) => s.enabled);
    let probed: McpStatusEntry[] = [];
    if (active.length) {
      try {
        const r = await fetch("/api/mcp/user/probe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ servers: active }) });
        if (r.ok) probed = (await r.json()).servers || [];
      } catch {}
    }
    for (const s of user) {
      const p = probed.find((x) => x.name === s.name);
      servers.push(p || { name: s.name, type: "http", status: s.enabled ? "failed" : "disabled", tools: [], toolCount: 0, error: s.enabled ? "probe failed" : null, source: "browser" });
      if (p) for (const t of p.tools) modelTools.push({ server: s.name, name: `${s.name}_${t.name}`, originalName: t.name, description: t.description || "", inputSchema: t.inputSchema });
    }
  }
  _toolsCache = { at: Date.now(), tools: modelTools };
  return { servers, modelTools };
}

let _toolsCache: { at: number; tools: any[] } | null = null;

// Short tool list appended to the system prompt so the model knows which MCP tools exist.
export async function getMcpToolsPrompt(): Promise<string> {
  try {
    if (!_toolsCache || Date.now() - _toolsCache.at > 60000) {
      await Promise.race([fetchMcpStatus(), new Promise((r) => setTimeout(r, 4000))]);
    }
    const maxTools = parseInt(kv.getItem("mcp_max_tools") || "15", 10) || 15;
    const maxDes = parseInt(kv.getItem("mcp_max_des") || "250", 10) || 250;
    const tools = (_toolsCache?.tools || []).slice(0, maxTools);
    if (!tools.length) return "";
    const lines = tools.map((t: any) => {
      const keys = Object.keys(t.inputSchema?.properties || {}).slice(0, 5).join(", ");
      return `- ${t.server}.${t.originalName}: ${(t.description || "").slice(0, maxDes)}${keys ? ` (args: ${keys})` : ""}`;
    });
    return `\n\n[MCP tools available] Call one with mcp_call(server="<server>", tool="<tool>", args={...}):\n${lines.join("\n")}`;
  } catch { return ""; }
}

export async function callMcpTool(server: string, tool: string, args: Record<string, any> = {}): Promise<any> {
  const us = getUserMcpServers().find((x) => x.name === server && x.enabled);
  const resp = us
    ? await fetch("/api/mcp/user/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: { name: us.name, url: us.url, headers: us.headers }, tool, args }),
      })
    : await fetch("/api/mcp/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server, tool, args }),
      });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error || `MCP call failed ${resp.status}`);
  }
  // MCP SDK returns { content: [{type:"text", text:"..."}], isError? }
  if (data?.isError) {
    const txt = Array.isArray(data.content) ? data.content.map((c:any)=>c.text||JSON.stringify(c)).join("\n") : JSON.stringify(data);
    throw new Error(txt);
  }
  return data;
}

export async function reconnectMcp(server: string): Promise<any> {
  const resp = await fetch("/api/mcp/reconnect", { method:"POST", headers:{ "Content-Type":"application/json"}, body: JSON.stringify({ server }) });
  return resp.json();
}

export async function toggleMcp(server: string, enabled: boolean): Promise<any> {
  const resp = await fetch("/api/mcp/toggle", { method:"POST", headers:{ "Content-Type":"application/json"}, body: JSON.stringify({ server, enabled }) });
  return resp.json();
}

export async function addMcpServer(payload: { name:string; type:string; command?:string; args?:string[]; url?:string; headers?:Record<string,string>; env?:Record<string,string>; enabled?:boolean }): Promise<any> {
  const resp = await fetch("/api/mcp/add", { method:"POST", headers:{ "Content-Type":"application/json"}, body: JSON.stringify(payload)});
  return resp.json();
}

export async function editMcpServer(payload: { oldName: string; name: string; type: string; command?: string; args?: string[]; url?: string; headers?: Record<string, string>; env?: Record<string, string>; enabled?: boolean }): Promise<any> {
  const resp = await fetch("/api/mcp/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return resp.json();
}

export async function deleteMcpServer(name: string): Promise<any> {
  const resp = await fetch("/api/mcp/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  return resp.json();
}

export function formatMcpStatusForChat(statusData: { servers: McpStatusEntry[] }): string {
  const { servers } = statusData;
  if (!servers || servers.length===0) return "No MCP servers configured. Add one in [SETTINGS] -> [MCP] or edit mcp.json.";
  const lines = servers.map(s => {
    const toolsInfo = s.status==="connected" ? `${s.toolCount} tools` : s.status==="failed" ? `failed (${s.error||"unknown"})` : s.status;
    return `${s.name} · ${s.type} · ${s.status} · ${toolsInfo}`;
  });
  return `MCP servers (${servers.length}):\n` + lines.join("\n") + `\n\nTip: /mcps shows this panel. Use [SETTINGS] -> [MCP] to Toggle On/Off, Reconnect, View tools.`;
}
