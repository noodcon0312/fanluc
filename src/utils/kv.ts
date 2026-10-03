// Settings, chats and memories are saved on disk by the local server (~/.fanluc/state.json),
// not in the browser. Same API as localStorage, but synchronous reads come from memory.
// On the very first run, anything already in the browser's localStorage is imported once.
const mem = new Map<string, string>();
let pendingSet: Record<string, string> = {};
let pendingRemove: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const body = JSON.stringify({ set: pendingSet, remove: pendingRemove });
  pendingSet = {};
  pendingRemove = [];
  fetch("/api/kv", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < 60000 }).catch(() => {});
}
function schedule() {
  if (!timer) timer = setTimeout(flush, 400);
}

export const kv = {
  getItem(k: string): string | null {
    return mem.has(k) ? (mem.get(k) as string) : null;
  },
  setItem(k: string, v: string) {
    mem.set(k, v);
    pendingSet[k] = v;
    pendingRemove = pendingRemove.filter((x) => x !== k);
    schedule();
  },
  removeItem(k: string) {
    mem.delete(k);
    delete pendingSet[k];
    pendingRemove.push(k);
    schedule();
  },
};

export async function kvInit(): Promise<void> {
  try {
    const r = await fetch("/api/kv");
    if (r.ok) {
      const { data } = await r.json();
      for (const [k, v] of Object.entries(data || {})) mem.set(k, v as string);
    }
  } catch {}
  // one-time import of old browser data (only if the server has nothing yet)
  try {
    if (mem.size === 0 && typeof localStorage !== "undefined" && localStorage.length > 0) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = k ? localStorage.getItem(k) : null;
        if (k && v !== null) kv.setItem(k, v);
      }
    }
  } catch {}
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("beforeunload", () => {
      if (timer) {
        clearTimeout(timer);
        flush();
      }
    });
  }
}
