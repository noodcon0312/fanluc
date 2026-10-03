import React, { useEffect, useRef, useState } from "react";
import { RandomFontText } from "../utils/randomFont";

type Mode = "allow" | "ask" | "deny";
type Cat = "create" | "move" | "delete" | "archive" | "install" | "edit";
interface Perm {
  modes: Record<Cat, Mode>;
  limits: { maxCreateMB: string; maxDeleteMB: string; maxInstallMB: string; maxToolCalls: string };
}

const ROWS: { key: Cat; label: string }[] = [
  { key: "create", label: "create file/folder" },
  { key: "move", label: "move/rename file/folder" },
  { key: "delete", label: "delete file/folder" },
  { key: "archive", label: "zip/unzip file/folder" },
  { key: "install", label: "install/uninstall libraries" },
  { key: "edit", label: "edit file" },
];

const LIMITS: { key: keyof Perm["limits"]; before: string; after: string }[] = [
  { key: "maxCreateMB", before: "Don't create files bigger than", after: "MB" },
  { key: "maxDeleteMB", before: "Don't delete files/folders/libraries bigger than", after: "MB" },
  { key: "maxInstallMB", before: "Don't install files/libraries bigger than", after: "MB" },
  { key: "maxToolCalls", before: "Don't use more than", after: "tool calls in one turn" },
];

const modeBtn = (active: boolean, mode: Mode) =>
  `px-2 py-1 border text-[11px] font-bold uppercase transition-colors ${
    active
      ? mode === "deny"
        ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black line-through"
        : "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black"
      : "border-black/30 dark:border-white/30 hover:border-black dark:hover:border-white"
  }`;

export const PermissionPanel: React.FC = () => {
  const [perm, setPerm] = useState<Perm | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/permissions")
      .then((r) => r.json())
      .then(setPerm)
      .catch(() => setError("Cannot reach the server"));
  }, []);

  const save = (next: Perm) => {
    setPerm(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch("/api/permissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => setError("Could not save"));
    }, 300);
  };

  if (!perm) return <div className="text-xs font-mono opacity-70">{error || "Loading..."}</div>;

  return (
    <div className="space-y-5 font-mono text-black dark:text-white text-xs">
      <div>
        <div className="font-bold uppercase tracking-wider mb-2">
          <RandomFontText text="run_cmd" />
        </div>
        <div className="space-y-1.5">
          {ROWS.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-2 border border-black/30 dark:border-white/30 px-2 py-1.5">
              <span>{r.label}</span>
              <div className="flex gap-1">
                {(["allow", "ask", "deny"] as Mode[]).map((m) => (
                  <button key={m} type="button" className={modeBtn(perm.modes[r.key] === m, m)} onClick={() => save({ ...perm, modes: { ...perm.modes, [r.key]: m } })}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="font-bold uppercase tracking-wider mb-2">
          <RandomFontText text="limits" />
        </div>
        <div className="space-y-1.5">
          {LIMITS.map((l) => (
            <label key={l.key} className="flex flex-wrap items-center gap-2 border border-black/30 dark:border-white/30 px-2 py-1.5">
              <span>{l.before}</span>
              <input
                value={perm.limits[l.key]}
                inputMode="decimal"
                onChange={(e) => save({ ...perm, limits: { ...perm.limits, [l.key]: e.target.value.replace(/[^0-9.]/g, "") } })}
                className="w-20 p-1 border border-black dark:border-white bg-white dark:bg-black text-xs font-mono focus:outline-none"
              />
              <span>{l.after}</span>
            </label>
          ))}
        </div>
        <div className="opacity-60 mt-1">Leave a box empty for no limit.</div>
      </div>

      <div className="opacity-60 leading-relaxed">
        These rules read the command text, so they cover common tools (rm, mv, cp, mkdir, zip, tar, sed -i, npm/pip/apt install, &gt; redirects). They can't see what a script does inside (python x.py, node x.js, make...).
      </div>
      {error && <div className="font-bold">{error}</div>}
    </div>
  );
};
