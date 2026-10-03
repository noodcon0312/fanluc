import fs from "fs";
import path from "path";
import type { CustomCommand, BuiltinCommand } from "./types.js";

export const BUILTIN: BuiltinCommand[] = [
  { name: "/help", desc: "Command and shortcut list", aliases: ["/h", "/?"] },
  { name: "/config", desc: "Settings panel: temperature, model, API, ...", aliases: ["/settings"] },
  { name: "/model", args: "[name]", desc: "List models / switch model" },
  { name: "/effort", args: "[fast|cautious|thorough|meticulous|omni]", desc: "Agent prompt/thinking depth" },
  { name: "/permissions", args: "[ask|autoEdit|readOnly]", desc: "Show/change file-write and shell rights", aliases: ["/perm", "/plan"] },
  { name: "/mcp", args: "[add <name> <command...>]", desc: "MCP server panel (enable/disable, reconnect, add)", aliases: ["/mcps"] },
  { name: "/resume", args: "[number|id]", desc: "Reopen an old chat in this folder" },
  { name: "/delete", args: "[number|id|all]", desc: "Delete a session (default: current)", aliases: ["/del", "/rm"] },
  { name: "/clear", desc: "Start a new session (old one stays resumable)", aliases: ["/new", "/reset"] },
  { name: "/compact", args: "[note to keep]", desc: "Summarize history to free context" },
  { name: "/context", desc: "Show current context usage" },
  { name: "/cost", desc: "Session token/turn stats (local model: estimates)", aliases: ["/usage"] },
  { name: "/status", desc: "Version, model, API, permission, workspace" },
  { name: "/doctor", desc: "Check API, server and config folder connectivity" },
  { name: "/init", desc: "Ask the agent to create FANLUC.md for the project" },
  { name: "/memory", desc: "Show the loaded FANLUC.md" },
  { name: "/rename", args: "<name>", desc: "Rename the session" },
  { name: "/export", args: "[file.md]", desc: "Export the conversation to a markdown file in the workspace" },
  { name: "/exit", desc: "Quit", aliases: ["/quit", "/q"] },
];

function readCmdDir(dir: string, out: Map<string, CustomCommand>): void {
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith(".md")) continue;
      const name = "/" + f.slice(0, -3).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      let raw = fs.readFileSync(path.join(dir, f), "utf-8").replace(/^\uFEFF/, "");
      let desc = "";
      const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
      if (fm) {
        const d = fm[1].match(/^description:\s*(.+)$/m);
        if (d) desc = d[1].trim();
        raw = raw.slice(fm[0].length);
      }
      out.set(name, { name, desc: desc || "(custom command)", body: raw.trim(), source: path.join(dir, f) });
    }
  } catch {
    /* ignore */
  }
}

export function loadCustomCommands(workspace: string, configDir: string): CustomCommand[] {
  const m = new Map<string, CustomCommand>();
  readCmdDir(path.join(configDir, "commands"), m);
  readCmdDir(path.join(workspace, ".fanluc", "commands"), m);
  return [...m.values()];
}

export function allCommands(custom: CustomCommand[]): (BuiltinCommand & { custom?: boolean })[] {
  return [...BUILTIN, ...custom.map((c) => ({ name: c.name, desc: c.desc, args: "[args]", custom: true }))];
}

export function resolveAlias(name: string): string {
  const n = name.toLowerCase();
  for (const c of BUILTIN) if (c.name === n || c.aliases?.includes(n)) return c.name;
  return n;
}
