import React, { useEffect, useRef, useState } from "react";

interface Pending {
  id: string;
  command: string;
  cwd: string;
  categories: string[];
  reasons: string[];
}

/** Always mounted: shows a dialog when the AI wants to run a command that needs the user's OK. */
export const PermissionPrompt: React.FC = () => {
  const [items, setItems] = useState<Pending[]>([]);
  const busy = useRef(false);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/permissions/pending");
        if (r.ok && !stop) setItems((await r.json()).pending || []);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  const decide = async (id: string, allow: boolean, remember = false) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await fetch("/api/permissions/decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, allow, remember }) });
    } catch {}
    setItems((l) => l.filter((x) => x.id !== id));
    busy.current = false;
  };

  const cur = items[0];
  if (!cur) return null;
  const btn = "px-3 py-1 border border-black dark:border-white text-xs font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 font-mono">
      <div className="w-full max-w-xl border-2 border-black dark:border-white bg-white text-black dark:bg-black dark:text-white shadow-2xl">
        <div className="border-b-2 border-black dark:border-white px-4 py-2 font-bold uppercase tracking-wider text-sm">
          AI wants to run a command {items.length > 1 ? `(${items.length} waiting)` : ""}
        </div>
        <div className="px-4 py-3 space-y-2 text-xs">
          <div className="opacity-70">Needs your OK for: {cur.categories.join(", ")}</div>
          {cur.reasons.map((r, i) => (
            <div key={i} className="opacity-70">
              • {r}
            </div>
          ))}
          <pre className="border border-black dark:border-white p-2 whitespace-pre-wrap break-all max-h-60 overflow-auto">{cur.command}</pre>
          <div className="opacity-60 break-all">in {cur.cwd}</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-black dark:border-white px-4 py-2">
          <button className={btn} onClick={() => decide(cur.id, false)}>
            [DENY]
          </button>
          <button className={btn} onClick={() => decide(cur.id, true, true)} title="Allow this and stop asking for these kinds of commands">
            [ALLOW + DON'T ASK AGAIN]
          </button>
          <button className="px-3 py-1 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black text-xs font-bold hover:opacity-80" onClick={() => decide(cur.id, true)}>
            [ALLOW]
          </button>
        </div>
      </div>
    </div>
  );
};
