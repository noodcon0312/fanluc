import React, { useCallback, useEffect, useState } from "react";

// Folder picker for the self-host edition: browse the folders of the machine the
// server runs on and choose the workspace (cwd of run_cmd). Works like the
// "open project" dialog of opencode web.

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => void;
}

interface BrowseData {
  path: string;
  parent: string | null;
  dirs: string[];
  fileCount: number;
  roots: { name: string; path: string }[];
}

export const WorkspacePicker: React.FC<Props> = ({ isOpen, onClose, onChanged }) => {
  const [current, setCurrent] = useState<string>("");
  const [recent, setRecent] = useState<string[]>([]);
  const [home, setHome] = useState<string>("");
  const [data, setData] = useState<BrowseData | null>(null);
  const [pathInput, setPathInput] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");

  const browse = useCallback(
    async (p: string, hidden = showHidden) => {
      setError("");
      try {
        const r = await fetch(`/api/fs/browse?path=${encodeURIComponent(p)}${hidden ? "&hidden=1" : ""}`);
        const j = await r.json();
        if (!r.ok) {
          setError(j.error || "Cannot open folder");
          return;
        }
        setData(j);
        setPathInput(j.path);
      } catch (e: any) {
        setError(e?.message || "Cannot reach the server");
      }
    },
    [showHidden]
  );

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const r = await fetch("/api/workspace");
        const j = await r.json();
        setCurrent(j.workspace || "");
        setRecent(j.recent || []);
        setHome(j.home || "");
        await browse(j.workspace || j.home || "");
      } catch (e: any) {
        setError(e?.message || "Cannot reach the server");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const choose = async (p: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/workspace/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || "Cannot use this folder");
        return;
      }
      setCurrent(j.workspace);
      onChanged();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const mkdir = async () => {
    if (!data || !newName.trim()) return;
    const r = await fetch("/api/fs/mkdir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent: data.path, name: newName.trim() }),
    });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error || "Cannot create folder");
      return;
    }
    setNewName("");
    browse(data.path);
  };

  const isWin = !!data && /^[a-zA-Z]:/.test(data.path);
  const sep = isWin ? "\\" : "/";
  const join = (base: string, name: string) => (base.endsWith(sep) ? base + name : base + sep + name);

  // breadcrumb segments
  const crumbs: { label: string; path: string }[] = [];
  if (data) {
    const parts = data.path.split(/[\\/]+/).filter(Boolean);
    if (isWin) {
      let acc = "";
      parts.forEach((part, i) => {
        acc = i === 0 ? part + "\\" : acc.endsWith("\\") ? acc + part : acc + "\\" + part;
        crumbs.push({ label: part, path: acc });
      });
    } else {
      crumbs.push({ label: "/", path: "/" });
      let acc = "";
      parts.forEach((part) => {
        acc += "/" + part;
        crumbs.push({ label: part, path: acc });
      });
    }
  }

  const btn =
    "px-2 py-1 border border-black dark:border-white bg-white text-black dark:bg-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold text-xs transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 font-mono" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col border-2 border-black dark:border-white bg-white text-black dark:bg-black dark:text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-black dark:border-white px-4 py-2">
          <h3 className="font-bold uppercase tracking-wider text-xs sm:text-sm">Choose workspace folder</h3>
          <button onClick={onClose} className={btn}>
            [CLOSE]
          </button>
        </div>

        <div className="px-4 py-3 space-y-3 overflow-y-auto text-xs">
          {/* quick links */}
          <div className="flex flex-wrap gap-1.5">
            {home && (
              <button className={btn} onClick={() => browse(home)}>
                [HOME]
              </button>
            )}
            {current && (
              <button className={btn} onClick={() => browse(current)}>
                [CURRENT]
              </button>
            )}
            {data?.roots?.map((r) => (
              <button key={r.path} className={btn} onClick={() => browse(r.path)}>
                [{r.name}]
              </button>
            ))}
          </div>
          {recent.length > 0 && (
            <div className="space-y-1">
              <div className="font-bold uppercase text-[10px]">Recent</div>
              {recent.slice(0, 6).map((r) => (
                <div key={r} className="flex items-center gap-2">
                  <button className="flex-1 text-left truncate hover:underline" title={r} onClick={() => choose(r)}>
                    {r}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* path input */}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              browse(pathInput);
            }}
          >
            <input
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="Type or paste a folder path, e.g. D:\\projects\\my-app"
              className="flex-1 p-2 border border-black dark:border-white bg-white dark:bg-black text-xs font-mono focus:outline-none"
            />
            <button type="submit" className={btn}>
              [GO]
            </button>
          </form>

          {/* breadcrumb */}
          {data && (
            <div className="flex flex-wrap items-center gap-1 opacity-90">
              {crumbs.map((c, i) => (
                <React.Fragment key={c.path + i}>
                  {i > 0 && <span className="opacity-50">{sep}</span>}
                  <button className="hover:underline" onClick={() => browse(c.path)}>
                    {c.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}

          {error && <div className="p-2 border border-black dark:border-white font-bold break-words">{error}</div>}

          {/* folder list */}
          <div className="border border-black dark:border-white max-h-64 overflow-y-auto">
            {data?.parent && (
              <button className="w-full text-left px-2 py-1.5 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black border-b border-black/20 dark:border-white/20" onClick={() => browse(data.parent!)}>
                ..
              </button>
            )}
            {data?.dirs.length === 0 && <div className="px-2 py-2 opacity-60">(no sub-folders)</div>}
            {data?.dirs.map((d) => (
              <button
                key={d}
                className="w-full text-left px-2 py-1.5 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black border-b border-black/10 dark:border-white/10 truncate"
                onClick={() => browse(join(data.path, d))}
                title={d}
              >
                {d}/
              </button>
            ))}
          </div>

          <div className="opacity-60">{data ? `${data.fileCount} files here` : ""}</div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t-2 border-black dark:border-white px-4 py-2">
          <button
            disabled={!data || busy}
            onClick={() => data && choose(data.path)}
            className="px-3 py-1 border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black font-bold text-xs hover:opacity-80 disabled:opacity-40"
          >
            [USE THIS FOLDER]
          </button>
        </div>
      </div>
    </div>
  );
};
