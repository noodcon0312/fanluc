import React, { useState } from "react";
import { MemEntry } from "../types";
import { RandomFontText, RandomFontInput, RandomFontTextarea } from "../utils/randomFont";
import { newMemEntry, saveStoredUserMems } from "../utils/memHelper";

interface Props {
  mems: MemEntry[];
  memEnabled: boolean;
  onChangeMems: (m: MemEntry[]) => void;
  onToggleEnabled: () => void;
}

export const MemPanel: React.FC<Props> = ({ mems, memEnabled, onChangeMems, onToggleEnabled }) => {
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const reset = () => { setName(""); setKeywords(""); setContent(""); setEditingId(null); };

  const handleSave = () => {
    if (!name.trim() || !content.trim()) return;
    const kw = keywords.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 20);
    let updated: MemEntry[];
    if (editingId) {
      updated = mems.map((m) => (m.id === editingId ? { ...m, name: name.trim(), keywords: kw, content: content.trim(), updatedAt: Date.now() } : m));
    } else {
      updated = [...mems, newMemEntry(name, kw, content)];
    }
    onChangeMems(updated);
    saveStoredUserMems(updated);
    reset();
  };

  const handleDelete = (id: string) => {
    const updated = mems.filter((x) => x.id !== id);
    onChangeMems(updated);
    saveStoredUserMems(updated);
  };

  const filtered = mems.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.content.toLowerCase().includes(q) || (m.keywords || []).join(" ").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 border-b border-black/20 dark:border-white/20 pb-2">
        <div>
          <div className="font-bold uppercase text-xs"><RandomFontText text="MEMORY (MEM):" /></div>
          <div className="opacity-70 text-[11px] mt-0.5"><RandomFontText text="User memory + AI memory. Keyword matching triggers read_mem." /></div>
        </div>
        <button type="button" onClick={onToggleEnabled}
          className={`px-3 py-1.5 border font-bold uppercase text-xs ${memEnabled ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white" : "border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"} transition-colors`}>
          <RandomFontText text={memEnabled ? "[MEM ON]" : "[MEM OFF]"} />
        </button>
      </div>

      <div className="p-3.5 border border-black dark:border-white space-y-3 bg-black/5 dark:bg-white/5">
        <div className="border-b border-black/20 dark:border-white/20 pb-1.5 flex items-center justify-between">
          <span className="font-bold uppercase text-xs tracking-wider">
            <RandomFontText text={editingId ? "[EDIT MEM]" : "[NEW MEM]"} />
          </span>
        </div>
        <div>
          <label className="block font-bold uppercase text-[11px] mb-1"><RandomFontText text="1. NAME / IDENTIFIER:" /></label>
          <RandomFontInput type="text" value={name} onChange={(e) => setName(e.target.value)} placeholderText="e.g. coding-style" inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs w-full focus:outline-none" />
        </div>
        <div>
          <label className="block font-bold uppercase text-[11px] mb-1"><RandomFontText text="2. KEYWORDS / TRIGGERS (COMMA SEPARATED):" /></label>
          <RandomFontInput type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholderText="e.g. typescript, strict, bun" inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs w-full focus:outline-none" />
        </div>
        <div>
          <label className="block font-bold uppercase text-[11px] mb-1"><RandomFontText text="3. CONTENT / STORED KNOWLEDGE:" /></label>
          <RandomFontTextarea value={content} onChange={(e) => setContent(e.target.value)} placeholderText="Memory content to remember..." rows={4} textareaClassName="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono text-xs w-full focus:outline-none" />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={handleSave} disabled={!name.trim() || !content.trim()} className="px-3 py-1.5 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white font-bold uppercase text-xs disabled:opacity-40 transition-colors">
            <RandomFontText text={editingId ? "[UPDATE]" : "[SAVE MEM]"} />
          </button>
          {editingId && <button type="button" onClick={reset} className="px-3 py-1.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold uppercase text-xs transition-colors"><RandomFontText text="[CANCEL]" /></button>}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <RandomFontInput type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholderText="Search mem..." inputClassName="p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs focus:outline-none" />
      </div>

      <div className="space-y-2">
        {filtered.map((m) => (
          <div key={m.id} className="p-3.5 border border-black dark:border-white bg-black/5 dark:bg-white/5 space-y-2 transition-colors">
            <div className="flex items-center justify-between gap-2 border-b border-black/20 dark:border-white/20 pb-1.5">
              <span className="font-bold text-xs uppercase">{m.name}</span>
              <span className="flex gap-1">
                <button type="button" onClick={() => { setEditingId(m.id); setName(m.name); setKeywords((m.keywords || []).join(", ")); setContent(m.content); }} className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[10px] font-bold uppercase transition-colors"><RandomFontText text="[EDIT]" /></button>
                <button type="button" onClick={() => handleDelete(m.id)} className="px-2 py-0.5 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[10px] font-bold uppercase transition-colors"><RandomFontText text="[DEL]" /></button>
              </span>
            </div>
            <div className="text-[10px] opacity-70 font-mono">keywords: {(m.keywords || []).join(", ") || "none"} — AI: read_mem({m.name})</div>
            <div className="text-[11px] font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">{m.content}</div>
          </div>
        ))}
        {filtered.length === 0 && <div className="opacity-60 text-[11px]">No mems yet.</div>}
      </div>
    </div>
  );
};
