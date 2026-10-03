import React, { useEffect, useState } from "react";
import { fetchMcpStatus, toggleMcp, addMcpServer, editMcpServer, deleteMcpServer, McpStatusEntry } from "../utils/mcpHelper";
import { RandomFontText } from "../utils/randomFont";
import { getUserMcpServers, saveUserMcpServers, getSearxngUrl, setSearxngUrl } from "../utils/userConfig";
import { kv } from "../utils/kv";

// One-click starting points. stdio = the server program runs on THIS computer (started by this app);
// http = the server lives at a URL (hosted by someone else, or on your own machine/network).
const MCP_PRESETS: { label: string; hint: string; name: string; type: "stdio" | "http"; command?: string; args?: string; url?: string }[] = [
  { label: "Playwright (real browser)", hint: "AI can open pages, click, fill forms, take screenshots. Needs Node.", name: "playwright", type: "stdio", command: "npx", args: "-y @playwright/mcp@latest" },
  { label: "Context7 (library docs)", hint: "Up-to-date docs for libraries/frameworks. Hosted, no install.", name: "context7", type: "http", url: "https://mcp.context7.com/mcp" },
  { label: "Context7 (local)", hint: "Same as above but runs on your PC via npx.", name: "context7-local", type: "stdio", command: "npx", args: "-y @upstash/context7-mcp" },
  { label: "Google Colab (official)", hint: "AI runs code in a Colab notebook you open in your browser. Needs `uv` (pip install uv). First start downloads from GitHub.", name: "colab-mcp", type: "stdio", command: "uvx", args: "git+https://github.com/googlecolab/colab-mcp" },
  { label: "Roblox Studio (Windows)", hint: "Built into Studio. First turn on: Assistant > ... > Manage MCP Servers > Enable Studio as MCP server.", name: "roblox-studio", type: "stdio", command: "cmd.exe", args: "/c %LOCALAPPDATA%\\Roblox\\mcp.bat" },
  { label: "Roblox Studio (macOS)", hint: "Built into Studio. First turn on: Assistant > ... > Manage MCP Servers > Enable Studio as MCP server.", name: "roblox-studio", type: "stdio", command: "/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP", args: "" },
  { label: "Test server", hint: "Reference server with demo tools — use it to check that MCP works.", name: "everything", type: "stdio", command: "npx", args: "-y @modelcontextprotocol/server-everything" },
];

export const McpPanel: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [servers, setServers] = useState<McpStatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", type: "http", command: "npx", args: "", url: "", token: "" });
  const [editForms, setEditForms] = useState<Record<string, { name: string; type: string; command: string; args: string; url: string; token: string }>>({});

  const [maxToolsMap, setMaxToolsMap] = useState<Record<string, number>>({});
  const [maxDesMap, setMaxDesMap] = useState<Record<string, number>>({});

  const [sx, setSx] = useState(getSearxngUrl());
  const isBrowser = (name: string) => servers.find((x) => x.name === name)?.source === "browser";
  const handleRemove = (name: string) => {
    saveUserMcpServers(getUserMcpServers().filter((x) => x.name !== name));
    load();
  };

  const getEditForm = (s: McpStatusEntry) => {
    if (editForms[s.name]) return editForms[s.name];
    return {
      name: s.name,
      type: s.type || "http",
      command: s.command || "npx",
      args: s.args || "",
      url: s.url || "",
      token: s.headers?.Authorization ? s.headers.Authorization.replace(/^Bearer\s+/i, "") : "",
    };
  };

  const updateEditForm = (serverName: string, updates: Partial<{ name: string; type: string; command: string; args: string; url: string; token: string }>) => {
    setEditForms((prev) => {
      const existing = prev[serverName] || {
        name: serverName,
        type: "http",
        command: "npx",
        args: "",
        url: "",
        token: "",
      };
      return { ...prev, [serverName]: { ...existing, ...updates } };
    });
  };

  const handleSaveEdit = async (s: McpStatusEntry) => {
    const ef = getEditForm(s);
    const cleanName = ef.name.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
    if (!cleanName) {
      alert("Server name is required");
      return;
    }

    if (ef.type === "http" || ef.type === "remote") {
      if (!ef.url.trim() || !/^https?:\/\//i.test(ef.url.trim())) {
        alert("A valid URL starting with http:// or https:// is required for HTTP MCP server");
        return;
      }
    } else {
      if (!ef.command.trim()) {
        alert("Command is required for stdio MCP server");
        return;
      }
    }

    if (s.source === "browser" && ef.type === "http") {
      const userList = getUserMcpServers().filter((x) => x.name !== s.name);
      const entry: any = { name: cleanName, url: ef.url.trim(), enabled: true };
      if (ef.token.trim()) entry.headers = { Authorization: `Bearer ${ef.token.trim()}` };
      saveUserMcpServers([...userList, entry]);
      setEditForms((prev) => { const n = { ...prev }; delete n[s.name]; return n; });
      load();
      return;
    }

    if (s.source === "browser" && ef.type === "stdio") {
      saveUserMcpServers(getUserMcpServers().filter((x) => x.name !== s.name));
      const res = await addMcpServer({
        name: cleanName,
        type: "stdio",
        command: ef.command.trim(),
        args: ef.args.trim() ? ef.args.trim().split(/\s+/) : [],
        enabled: true,
      });
      if (res?.error) alert(res.error);
      setEditForms((prev) => { const n = { ...prev }; delete n[s.name]; return n; });
      load();
      return;
    }

    const payload: any = {
      oldName: s.name,
      name: cleanName,
      type: ef.type,
      enabled: s.status !== "disabled",
    };
    if (ef.type === "http" || ef.type === "remote") {
      payload.url = ef.url.trim();
      if (ef.token.trim()) payload.headers = { Authorization: `Bearer ${ef.token.trim()}` };
    } else {
      payload.command = ef.command.trim();
      if (ef.args.trim()) payload.args = ef.args.trim().split(/\s+/);
    }

    const res = await editMcpServer(payload);
    if (res?.error) alert(res.error);
    setEditForms((prev) => { const n = { ...prev }; delete n[s.name]; return n; });
    load();
  };

  const handleDeleteServer = async (s: McpStatusEntry) => {
    if (s.source === "browser") {
      saveUserMcpServers(getUserMcpServers().filter((x) => x.name !== s.name));
    } else {
      await deleteMcpServer(s.name);
    }
    load();
  };

  const getMaxTools = (name: string) => {
    const v = kv.getItem(`mcp_max_tools_${name}`) || kv.getItem("mcp_max_tools");
    return v ? parseInt(v, 10) : 15;
  };
  const getMaxDes = (name: string) => {
    const v = kv.getItem(`mcp_max_des_${name}`) || kv.getItem("mcp_max_des");
    return v ? parseInt(v, 10) : 250;
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMcpStatus();
      setServers(data.servers || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });
  };

  const handleToggle = async (name: string, enabled: boolean) => {
    if (isBrowser(name)) {
      saveUserMcpServers(getUserMcpServers().map((x) => (x.name === name ? { ...x, enabled } : x)));
      load();
      return;
    }
    await toggleMcp(name, enabled);
    load();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim()) {
      alert("Name is required");
      return;
    }
    const payload: any = { name: addForm.name.trim().replace(/[^a-zA-Z0-9_-]/g, "_"), type: addForm.type, enabled: true };
    if (addForm.type === "http" || addForm.type === "remote") {
      payload.url = addForm.url.trim();
      if (addForm.token.trim()) payload.headers = { Authorization: `Bearer ${addForm.token.trim()}` };
    } else {
      payload.command = addForm.command.trim();
      if (addForm.args.trim()) payload.args = addForm.args.trim().split(/\s+/);
    }
    const res = await addMcpServer(payload);
    if (res?.error) alert(res.error);
    setShowAdd(false);
    load();
  };

  return (
    <div className="space-y-3 font-mono text-xs">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/20 dark:border-white/20 pb-2">
        <div className="font-bold uppercase text-xs">
          <RandomFontText text={`MCP(${servers.length}):`} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={load}
            className="px-2.5 py-1 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[10px] font-bold uppercase transition-colors"
          >
            <RandomFontText text="[RELOAD]" />
          </button>
          {!showAdd && (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="px-3 py-1 border border-black dark:border-white bg-white text-black dark:bg-white dark:text-black font-bold uppercase text-xs hover:bg-black hover:text-white dark:hover:bg-black dark:hover:text-white transition-colors"
            >
              <RandomFontText text="[+ ADD SERVER]" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-2 py-1 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[10px] font-bold uppercase transition-colors"
            >
              <RandomFontText text="[CLOSE]" />
            </button>
          )}
        </div>
      </div>

      {/* SearXNG URL Setting */}
      <div className="p-3 border border-black dark:border-white bg-black/5 dark:bg-white/5 space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="block font-bold uppercase text-[10px] opacity-80">
            <RandomFontText text="SearXNG URL (optional):" />
          </label>
        </div>
        <div className="flex gap-2">
          <input
            value={sx}
            onChange={(e) => setSx(e.target.value)}
            placeholder="https://searx.example.com"
            className="flex-1 px-2 py-1 border border-black dark:border-white bg-white dark:bg-black text-xs font-mono focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setSearxngUrl(sx);
              alert("Saved SearXNG URL");
            }}
            className="px-2.5 py-1 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold uppercase text-[10px] transition-colors"
          >
            <RandomFontText text="[SAVE]" />
          </button>
        </div>
      </div>

      {loading && <div className="opacity-60 text-[11px] p-2">Loading MCP servers...</div>}
      {error && <div className="border border-black dark:border-white p-2 text-xs font-bold">{error}</div>}

      {!loading && !error && servers.length === 0 && (
        <div className="p-6 border border-dashed border-black dark:border-white bg-black/5 dark:bg-white/5 text-center space-y-3">
          <div className="font-bold uppercase text-xs opacity-75">
            <RandomFontText text="None Yet" />
          </div>
        </div>
      )}

      {/* Server Items List */}
      {!loading && (
        <div className="space-y-2">
          {servers.map((s) => {
            const isOff = s.status === "disabled";
            const currentMaxTools = maxToolsMap[s.name] ?? getMaxTools(s.name);
            const currentMaxDes = maxDesMap[s.name] ?? getMaxDes(s.name);

            return (
              <div
                key={s.name}
                className={`p-3.5 border border-black dark:border-white bg-black/5 dark:bg-white/5 transition-colors space-y-2.5 ${
                  !isOff ? "" : "opacity-60"
                }`}
              >
                <div className="flex items-center justify-between gap-2 border-b border-black/20 dark:border-white/20 pb-1.5">
                  <div className="min-w-0">
                    <div className="font-bold uppercase text-xs truncate flex items-center gap-1.5 flex-wrap">
                      <span>{s.name}</span>
                      <span className="opacity-60 text-[10px]">· {s.type}</span>
                    </div>
                    {s.status === "failed" && s.error && (
                      <div className="text-[10px] break-words mt-1 border-t border-black/20 dark:border-white/20 pt-1 opacity-80">
                        Error: {s.error.slice(0, 300)}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isOff ? (
                      <button
                        type="button"
                        onClick={() => handleToggle(s.name, false)}
                        className="px-2 py-0.5 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white text-[10px] font-bold uppercase transition-colors"
                        title="Click to turn OFF"
                      >
                        [ON]
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggle(s.name, true)}
                        className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[10px] font-bold uppercase transition-colors"
                        title="Click to turn ON"
                      >
                        [OFF]
                      </button>
                    )}

                    {s.source === "browser" && (
                      <button
                        type="button"
                        onClick={() => handleRemove(s.name)}
                        className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[10px] font-bold uppercase transition-colors"
                      >
                        [DELETE]
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleExpand(s.name)}
                      className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[10px] font-bold uppercase transition-colors"
                    >
                      {expanded.has(s.name) ? "[CLOSE]" : "[EDIT]"}
                    </button>
                  </div>
                </div>

                {expanded.has(s.name) && (() => {
                  const ef = getEditForm(s);
                  return (
                    <div className="pt-2 border-t border-black/20 dark:border-white/20 space-y-3">
                      {/* Server Config & Rename Form */}
                      <div className="p-3.5 border border-black dark:border-white bg-black/5 dark:bg-white/5 space-y-3">
                        <div className="flex items-center justify-between border-b border-black/20 dark:border-white/20 pb-1.5">
                          <span className="font-bold uppercase text-xs tracking-wider">
                            <RandomFontText text="[EDIT SERVER CONFIG]" />
                          </span>
                          <span className="text-[10px] opacity-60 uppercase">source: {s.source || "server"}</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block font-bold uppercase text-[10px] mb-1 opacity-80">
                              <RandomFontText text="NAME (a-z, -, _):" />
                            </label>
                            <input
                              value={ef.name}
                              onChange={(e) => updateEditForm(s.name, { name: e.target.value })}
                              placeholder="server-name"
                              className="w-full px-2 py-1 border border-black dark:border-white bg-white dark:bg-black text-xs font-mono focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block font-bold uppercase text-[10px] mb-1 opacity-80">
                              <RandomFontText text="TYPE:" />
                            </label>
                            <select
                              value={ef.type}
                              onChange={(e) => updateEditForm(s.name, { type: e.target.value })}
                              className="w-full px-2 py-1 border border-black dark:border-white bg-white dark:bg-black text-xs font-mono focus:outline-none"
                            >
                              <option value="stdio">stdio (continuous local command)</option>
                              <option value="http">http (remote URL endpoint)</option>
                            </select>
                          </div>
                        </div>

                        {ef.type === "stdio" || ef.type === "local" ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="block font-bold uppercase text-[10px] mb-1 opacity-80">
                                <RandomFontText text="COMMAND:" />
                              </label>
                              <input
                                value={ef.command}
                                onChange={(e) => updateEditForm(s.name, { command: e.target.value })}
                                placeholder="npx"
                                className="w-full px-2 py-1 border border-black dark:border-white bg-white dark:bg-black text-xs font-mono focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block font-bold uppercase text-[10px] mb-1 opacity-80">
                                <RandomFontText text="ARGS (SPACE-SEPARATED):" />
                              </label>
                              <input
                                value={ef.args}
                                onChange={(e) => updateEditForm(s.name, { args: e.target.value })}
                                placeholder="-y @modelcontextprotocol/server-everything"
                                className="w-full px-2 py-1 border border-black dark:border-white bg-white dark:bg-black text-xs font-mono focus:outline-none"
                              />
                            </div>
                          </div>
                        ) : (
                          <div>
                            <label className="block font-bold uppercase text-[10px] mb-1 opacity-80">
                              <RandomFontText text="URL:" />
                            </label>
                            <input
                              value={ef.url}
                              onChange={(e) => updateEditForm(s.name, { url: e.target.value })}
                              placeholder="https://example.com/mcp"
                              className="w-full px-2 py-1 border border-black dark:border-white bg-white dark:bg-black text-xs font-mono focus:outline-none"
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(s)}
                            className="px-3 py-1.5 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black font-bold uppercase text-xs hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-colors"
                          >
                            <RandomFontText text="[SAVE CHANGES]" />
                          </button>
                        </div>
                      </div>

                      {/* Max Tools & Max Description Options */}
                      <div className="p-3 border border-black dark:border-white bg-black/5 dark:bg-white/5 space-y-2">
                      <div className="font-bold uppercase text-[10px] opacity-90">TOOL CONFIGURATION:</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold uppercase opacity-80 mb-0.5">
                            MAX TOOLS:
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={currentMaxTools}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 15;
                              setMaxToolsMap((prev) => ({ ...prev, [s.name]: val }));
                              kv.setItem(`mcp_max_tools_${s.name}`, String(val));
                              kv.setItem("mcp_max_tools", String(val));
                            }}
                            className="w-full px-2 py-1 border border-black dark:border-white bg-white dark:bg-black text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase opacity-80 mb-0.5">
                            MAX DESC LENGTH (CHARS):
                          </label>
                          <input
                            type="number"
                            min="10"
                            max="5000"
                            value={currentMaxDes}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 250;
                              setMaxDesMap((prev) => ({ ...prev, [s.name]: val }));
                              kv.setItem(`mcp_max_des_${s.name}`, String(val));
                              kv.setItem("mcp_max_des", String(val));
                            }}
                            className="w-full px-2 py-1 border border-black dark:border-white bg-white dark:bg-black text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Server Tools Content List */}
                    <div className="space-y-1.5">
                      <div className="font-bold uppercase text-[10px] opacity-80 flex items-center justify-between">
                        <span>SERVER TOOLS ({s.tools.length}):</span>
                      </div>
                      {s.tools.length === 0 ? (
                        <div className="opacity-60 text-[10px] p-2 border border-dashed border-black/20 dark:border-white/20">
                          No tools available on this server
                        </div>
                      ) : (
                        <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                          {s.tools.slice(0, currentMaxTools).map((t: any, i: number) => {
                            const desc = t.description ? t.description.slice(0, currentMaxDes) : "no description";
                            return (
                              <div
                                key={i}
                                className="p-2 border border-black/15 dark:border-white/15 text-[11px] leading-snug space-y-0.5 bg-white dark:bg-black"
                              >
                                <div className="font-bold text-xs">{s.name}_{t.name}</div>
                                <div className="opacity-75 text-[10px]">{desc}</div>
                                {t.inputSchema?.properties && Object.keys(t.inputSchema.properties).length > 0 && (
                                  <div className="opacity-50 text-[9px] pt-0.5">
                                    Args: {Object.keys(t.inputSchema.properties).join(", ")}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {s.tools.length > currentMaxTools && (
                            <div className="text-[10px] opacity-60 italic text-center pt-1">
                              +{s.tools.length - currentMaxTools} more tools hidden by MAX TOOLS limit
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Server Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="p-3.5 border border-black dark:border-white bg-black/5 dark:bg-white/5 space-y-3">
          <div className="flex items-center justify-between border-b border-black/20 dark:border-white/20 pb-1.5">
            <span className="font-bold uppercase text-xs tracking-wider">
              <RandomFontText text="[ADD NEW MCP SERVER]" />
            </span>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="text-[10px] uppercase font-bold px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
            >
              <RandomFontText text="[CANCEL]" />
            </button>
          </div>

          <div>
            <div className="mb-3 space-y-2 border border-black/30 dark:border-white/30 p-2">
              <div className="font-bold uppercase text-[10px]">Quick add</div>
              <div className="flex flex-wrap gap-1.5">
                {MCP_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    title={p.hint}
                    onClick={() =>
                      setAddForm({ ...addForm, name: p.name, type: p.type, command: p.command || "npx", args: p.args || "", url: p.url || "", token: "" })
                    }
                    className="px-2 py-1 border border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[10px] font-bold"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="text-[10px] opacity-70 leading-relaxed">
                <b>stdio</b> = the MCP server is a program that runs on this computer; this app starts it (e.g. <code>npx -y some-package</code>) and talks to it. Most MCP servers use this.
                <br />
                <b>http</b> = the MCP server is already running somewhere at a URL (a hosted service, or your own server). You only paste the URL (+ token if it needs one).
                <br />
                In args you can write <code>${"{WORKSPACE}"}</code> for the folder you picked in [DIR].
              </div>
            </div>
            <label className="block font-bold uppercase text-[10px] mb-1">Name (a-z, -, _):</label>
            <input
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              placeholder="my-server"
              className="w-full p-2 border border-black dark:border-white bg-white dark:bg-black text-xs font-mono focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block font-bold uppercase text-[10px] mb-1">Type:</label>
            <select
              value={addForm.type}
              onChange={(e) => setAddForm({ ...addForm, type: e.target.value })}
              className="w-full p-2 border border-black dark:border-white bg-white dark:bg-black text-xs font-mono focus:outline-none"
            >
              <option value="stdio">stdio (program started on this computer)</option>
              <option value="http">http (server at a URL)</option>
            </select>
          </div>

          {addForm.type === "stdio" || addForm.type === "local" ? (
            <>
              <div>
                <label className="block font-bold uppercase text-[10px] mb-1">Command:</label>
                <input
                  value={addForm.command}
                  onChange={(e) => setAddForm({ ...addForm, command: e.target.value })}
                  placeholder="npx"
                  className="w-full p-2 border border-black dark:border-white bg-white dark:bg-black text-xs font-mono focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold uppercase text-[10px] mb-1">Args (space-separated):</label>
                <input
                  value={addForm.args}
                  onChange={(e) => setAddForm({ ...addForm, args: e.target.value })}
                  placeholder="-y @modelcontextprotocol/server-everything"
                  className="w-full p-2 border border-black dark:border-white bg-white dark:bg-black text-xs font-mono focus:outline-none"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block font-bold uppercase text-[10px] mb-1">URL:</label>
                <input
                  value={addForm.url}
                  onChange={(e) => setAddForm({ ...addForm, url: e.target.value })}
                  placeholder="https://example.com/mcp"
                  className="w-full p-2 border border-black dark:border-white bg-white dark:bg-black text-xs font-mono focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block font-bold uppercase text-[10px] mb-1">Bearer Token (optional, stored as header):</label>
                <input
                  value={addForm.token}
                  onChange={(e) => setAddForm({ ...addForm, token: e.target.value })}
                  placeholder="${TOKEN} or raw token"
                  className="w-full p-2 border border-black dark:border-white bg-white dark:bg-black text-xs font-mono focus:outline-none"
                />
              </div>
            </>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="px-3 py-1.5 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black font-bold uppercase text-xs hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-colors"
            >
              <RandomFontText text="[SAVE SERVER]" />
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white font-bold uppercase text-xs hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
            >
              <RandomFontText text="[CANCEL]" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
