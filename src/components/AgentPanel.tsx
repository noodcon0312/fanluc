import React, { useState } from "react";
import { AgentConfig, EffortLevel } from "../types";
import { RandomFontText, RandomFontInput, RandomFontTextarea } from "../utils/randomFont";
import { newAgentConfig, testAgent, agentWorkspaceFolder } from "../utils/agentHelper";

interface Props {
  agents: AgentConfig[];
  agentEnabled: boolean;
  onChangeAgents: (a: AgentConfig[]) => void;
  onToggleEnabled: () => void;
}

export const AgentPanel: React.FC<Props> = ({ agents, agentEnabled, onChangeAgents, onToggleEnabled }) => {
  const [f, setF] = useState<AgentConfig>(() => newAgentConfig());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState("");
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState("");

  const set = (k: keyof AgentConfig, v: any) => setF((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!f.name.trim() || !f.apiUrl.trim()) { setMsg("Need name + API URL."); return; }
    const now = Date.now();
    let saved: AgentConfig;
    if (editingId) {
      const updated = agents.map((a) => (a.id === editingId ? { ...a, ...f, name: f.name.trim(), updatedAt: now } : a));
      onChangeAgents(updated);
      saved = updated.find((a) => a.id === editingId)!;
      setEditingId(null);
    } else {
      saved = { ...f, id: "agent_" + now + "_" + Math.random().toString(36).slice(2, 6), name: f.name.trim(), createdAt: now, updatedAt: now };
      onChangeAgents([...agents, saved]);
    }
    setF(newAgentConfig());
    setMsg("Saved. Running test prompt...");
    setTesting(true);
    try {
      const r = await testAgent(saved);
      setTestResult(r.ok ? `OK: ${r.text}` : `Failed: ${r.text}`);
      setMsg("Test completed.");
    } catch (e: any) { setMsg("Test failed: " + (e?.message || e)); }
    finally { setTesting(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 border-b border-black/20 dark:border-white/20 pb-2">
        <div>
          <div className="font-bold uppercase text-xs"><RandomFontText text="SUB-AGENTS:" /></div>
          <div className="opacity-70 text-[11px] mt-0.5"><RandomFontText text="Each sub-agent has its own isolated workspace and API configuration." /></div>
        </div>
        <button type="button" onClick={onToggleEnabled}
          className={`px-3 py-1.5 border font-bold uppercase text-xs ${agentEnabled ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white" : "border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"} transition-colors`}>
          <RandomFontText text={agentEnabled ? "[AGENT ON]" : "[AGENT OFF]"} />
        </button>
      </div>

      <div className="p-3.5 border border-black dark:border-white space-y-3 bg-black/5 dark:bg-white/5">
        <div className="border-b border-black/20 dark:border-white/20 pb-1.5 flex items-center justify-between">
          <span className="font-bold uppercase text-xs tracking-wider">
            <RandomFontText text={editingId ? "[EDIT AGENT]" : "[NEW AGENT]"} />
          </span>
        </div>
        <label className="block font-bold uppercase text-[11px]"><RandomFontText text="Agent Name:" /></label>
        <RandomFontInput type="text" value={f.name} onChange={(e) => set("name", e.target.value)} placeholderText="e.g. coder-fast" inputClassName="p-2 border border-black dark:border-white font-mono text-xs w-full bg-white dark:bg-black focus:outline-none" />
        <label className="block font-bold uppercase text-[11px]"><RandomFontText text="Description (for main AI tool selection):" /></label>
        <RandomFontTextarea value={f.description} onChange={(e) => set("description", e.target.value)} placeholderText="e.g. good for easy coding tasks, fast execution" rows={2} textareaClassName="p-2 border border-black dark:border-white font-mono text-xs w-full bg-white dark:bg-black focus:outline-none" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div><label className="block font-bold uppercase text-[11px]">API URL:</label>
            <RandomFontInput type="text" value={f.apiUrl} onChange={(e) => set("apiUrl", e.target.value)} placeholderText="https://.../v1/chat/completions" inputClassName="p-2 border border-black dark:border-white font-mono text-xs w-full bg-white dark:bg-black focus:outline-none" /></div>
          <div><label className="block font-bold uppercase text-[11px]">API KEY:</label>
            <RandomFontInput type="text" value={f.apiKey} onChange={(e) => set("apiKey", e.target.value)} placeholderText="key..." inputClassName="p-2 border border-black dark:border-white font-mono text-xs w-full bg-white dark:bg-black focus:outline-none" /></div>
          <div><label className="block font-bold uppercase text-[11px]">MODEL:</label>
            <RandomFontInput type="text" value={f.model || ""} onChange={(e) => set("model", e.target.value)} placeholderText="model id" inputClassName="p-2 border border-black dark:border-white font-mono text-xs w-full bg-white dark:bg-black focus:outline-none" /></div>
          <div><label className="block font-bold uppercase text-[11px]">MAX TOKENS:</label>
            <RandomFontInput type="text" value={String(f.maxTokens)} onChange={(e) => set("maxTokens", parseInt(e.target.value, 10) || 2000)} placeholderText="2000" inputClassName="p-2 border border-black dark:border-white font-mono text-xs w-full bg-white dark:bg-black focus:outline-none" /></div>
          <div><label className="block font-bold uppercase text-[11px]">TEMPERATURE:</label>
            <RandomFontInput type="text" value={String(f.temperature)} onChange={(e) => set("temperature", parseFloat(e.target.value) || 0)} placeholderText="0.7" inputClassName="p-2 border border-black dark:border-white font-mono text-xs w-full bg-white dark:bg-black focus:outline-none" /></div>
          <div><label className="block font-bold uppercase text-[11px]">TOP_P:</label>
            <RandomFontInput type="text" value={f.topP !== undefined ? String(f.topP) : ""} onChange={(e) => set("topP", parseFloat(e.target.value))} placeholderText="0.95" inputClassName="p-2 border border-black dark:border-white font-mono text-xs w-full bg-white dark:bg-black focus:outline-none" /></div>
          <div><label className="block font-bold uppercase text-[11px]">TOP_K:</label>
            <RandomFontInput type="text" value={f.topK !== undefined ? String(f.topK) : ""} onChange={(e) => set("topK", parseInt(e.target.value, 10))} placeholderText="20" inputClassName="p-2 border border-black dark:border-white font-mono text-xs w-full bg-white dark:bg-black focus:outline-none" /></div>
          <div><label className="block font-bold uppercase text-[11px]">REPEAT_PENALTY:</label>
            <RandomFontInput type="text" value={f.repeatPenalty !== undefined ? String(f.repeatPenalty) : ""} onChange={(e) => set("repeatPenalty", parseFloat(e.target.value))} placeholderText="1.05" inputClassName="p-2 border border-black dark:border-white font-mono text-xs w-full bg-white dark:bg-black focus:outline-none" /></div>
          <div><label className="block font-bold uppercase text-[11px]">EFFORT:</label>
            <select value={f.effort} onChange={(e) => set("effort", e.target.value as EffortLevel)} className="p-2 border border-black dark:border-white font-mono text-xs w-full bg-white dark:bg-black focus:outline-none">
              <option value="fast">fast</option><option value="cautious">cautious</option>
              <option value="thorough">thorough</option><option value="meticulous">meticulous</option>
            </select></div>
          <div><label className="block font-bold uppercase text-[11px]">TAG (text/image):</label>
            <select value={f.tag} onChange={(e) => set("tag", e.target.value as "text" | "image")} className="p-2 border border-black dark:border-white font-mono text-xs w-full bg-white dark:bg-black focus:outline-none">
              <option value="text">text</option><option value="image">image</option>
            </select></div>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={handleSave} disabled={testing || !f.name.trim()} className="px-3 py-1.5 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white font-bold uppercase text-xs disabled:opacity-40 transition-colors">
            <RandomFontText text={editingId ? "[UPDATE + TEST]" : "[SAVE + TEST]"} />
          </button>
        </div>
        {msg && <div className="text-[11px] font-mono opacity-80">{msg}</div>}
        {testResult && <div className="text-[11px] font-mono p-2 border border-black dark:border-white whitespace-pre-wrap">{testResult}</div>}
      </div>

      <div className="space-y-2">
        {agents.map((a) => (
          <div key={a.id} className="p-3.5 border border-black dark:border-white bg-black/5 dark:bg-white/5 space-y-2 transition-colors">
            <div className="flex items-center justify-between gap-2 border-b border-black/20 dark:border-white/20 pb-1.5">
              <span className="font-bold text-xs uppercase">{a.name} [{a.tag}]</span>
              <span className="flex gap-1 flex-wrap">
                <button type="button" onClick={() => { setEditingId(a.id); setF({ ...a }); }} className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[10px] font-bold uppercase transition-colors">[EDIT]</button>
                <button type="button" onClick={() => onChangeAgents(agents.filter((x) => x.id !== a.id))} className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[10px] font-bold uppercase transition-colors">[DEL]</button>
              </span>
            </div>
            <div className="text-[11px] font-mono mt-1">name: {a.name}</div>
            <div className="text-[11px] font-mono">description: {a.description || "(none)"}</div>
            <div className="text-[10px] opacity-60 font-mono">workspace: .fanluc/agents/{agentWorkspaceFolder(a)}</div>
            {a.tag === "image" && <div className="text-[11px] font-mono font-bold">for view_image_agent only</div>}
            <div className="text-[10px] opacity-60 font-mono">{a.model || "default"} | {a.apiUrl}</div>
          </div>
        ))}
        {agents.length === 0 && <div className="opacity-60 text-[11px]">No agents yet.</div>}
      </div>
    </div>
  );
};
