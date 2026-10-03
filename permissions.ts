// Permissions for run_cmd / run_cmd_bg.
//
// IMPORTANT (honest limits): this works by READING THE COMMAND TEXT. It understands the common
// shell tools (rm, mv, cp, mkdir, zip, tar, sed -i, npm/pip/apt install, redirections like `> file`...).
// It can NOT see what a script does inside (python build.py, node x.js, make, npm run ...).
// Those unknown commands are treated as allowed.
//
// Max file size when creating is enforced by the OS (`ulimit -f`) on Linux/macOS, and by a
// post-run scan that removes oversized new files on Windows.
import fs from "fs";
import os from "os";
import path from "path";
import type { Express, RequestHandler } from "express";

export type Mode = "allow" | "ask" | "deny";
export type Cat = "create" | "move" | "delete" | "archive" | "install" | "edit";

export interface PermConfig {
  modes: Record<Cat, Mode>;
  /** strings so the UI text boxes can stay empty ("" = no limit) */
  limits: { maxCreateMB: string; maxDeleteMB: string; maxInstallMB: string; maxToolCalls: string };
}

const DEFAULTS: PermConfig = {
  modes: { create: "ask", move: "allow", delete: "ask", archive: "allow", install: "ask", edit: "allow" },
  limits: { maxCreateMB: "", maxDeleteMB: "", maxInstallMB: "", maxToolCalls: "" },
};

const LABEL: Record<Cat, string> = {
  create: "create file/folder",
  move: "move/rename",
  delete: "delete",
  archive: "zip/unzip",
  install: "install/uninstall libraries",
  edit: "edit file",
};

const FILE = path.join(os.homedir(), ".fanluc", "permissions.json");
let cache: PermConfig | null = null;

export function getPerms(): PermConfig {
  if (cache) return cache;
  let raw: any = {};
  try {
    raw = JSON.parse(fs.readFileSync(FILE, "utf-8"));
  } catch {}
  cache = sanitize(raw);
  return cache;
}

function sanitize(raw: any): PermConfig {
  const out: PermConfig = JSON.parse(JSON.stringify(DEFAULTS));
  for (const k of Object.keys(DEFAULTS.modes) as Cat[]) {
    const v = raw?.modes?.[k];
    if (v === "allow" || v === "ask" || v === "deny") out.modes[k] = v;
  }
  for (const k of Object.keys(DEFAULTS.limits) as (keyof PermConfig["limits"])[]) {
    const v = raw?.limits?.[k];
    if (typeof v === "string" || typeof v === "number") out.limits[k] = String(v).trim().replace(/[^0-9.]/g, "").slice(0, 12);
  }
  return out;
}

export function setPerms(raw: any): PermConfig {
  cache = sanitize(raw);
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), { mode: 0o600 });
  } catch (e) {
    console.warn("[permissions] save failed:", e);
  }
  return cache;
}

function limitBytes(s: string): number | null {
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n * 1024 * 1024 : null;
}
const fmt = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// ===========================================================================
// Command parsing
// ===========================================================================
interface Seg {
  tokens: string[];
  redirects: string[]; // file targets of > / >>
}

const WIN = process.platform === "win32";

function splitCommand(cmd: string): Seg[] {
  const segs: Seg[] = [];
  let tokens: string[] = [];
  let redirects: string[] = [];
  let cur = "";
  let has = false; // current word exists (even if empty quotes)
  let heredocEnd: string | null = null;
  const pendingHeredocs: { marker: string; strip: boolean }[] = [];

  const endWord = () => {
    if (has) tokens.push(cur);
    cur = "";
    has = false;
  };
  const endSeg = () => {
    endWord();
    if (tokens.length || redirects.length) segs.push({ tokens, redirects });
    tokens = [];
    redirects = [];
  };
  const readWord = (i: number): { word: string; next: number } => {
    while (i < cmd.length && (cmd[i] === " " || cmd[i] === "\t")) i++;
    let w = "";
    let q: string | null = null;
    while (i < cmd.length) {
      const c = cmd[i];
      if (q) {
        if (c === q) q = null;
        else w += c;
      } else if (c === "'" || c === '"') q = c;
      else if (/[\s;&|<>()]/.test(c)) break;
      else w += c;
      i++;
    }
    return { word: w, next: i };
  };

  let i = 0;
  let quote: string | null = null;
  while (i < cmd.length) {
    const c = cmd[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && !WIN && i + 1 < cmd.length) {
        cur += cmd[++i];
      } else cur += c;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      has = true;
      i++;
      continue;
    }
    if (c === "\\" && !WIN && i + 1 < cmd.length) {
      cur += cmd[i + 1];
      has = true;
      i += 2;
      continue;
    }
    if (c === "\n") {
      endSeg();
      i++;
      // heredoc bodies are data, not commands
      if (pendingHeredocs.length) {
        for (const h of pendingHeredocs) {
          while (i < cmd.length) {
            let e = cmd.indexOf("\n", i);
            if (e < 0) e = cmd.length;
            const line = cmd.slice(i, e);
            i = Math.min(cmd.length, e + 1);
            if ((h.strip ? line.trim() : line.replace(/\r$/, "")) === h.marker) break;
          }
        }
        pendingHeredocs.length = 0;
      }
      continue;
    }
    if (c === ";" || c === "|" || c === "&") {
      // "2>&1" / ">&2" are handled in the '>' branch, so a bare & here is a separator
      if ((c === "&" || c === "|") && cmd[i + 1] === c) i++;
      endSeg();
      i++;
      continue;
    }
    if (c === "(" || c === ")") {
      endSeg();
      i++;
      continue;
    }
    if (c === "<") {
      if (cmd[i + 1] === "<" && cmd[i + 2] !== "<") {
        let j = i + 2;
        let strip = false;
        if (cmd[j] === "-") {
          strip = true;
          j++;
        }
        const { word, next } = readWord(j);
        if (word) pendingHeredocs.push({ marker: word, strip });
        i = next;
      } else {
        const { next } = readWord(i + (cmd[i + 1] === "<" ? 3 : 1));
        i = next;
      }
      continue;
    }
    if (c === ">") {
      // fd prefix like 2> / 1>
      let fd = "";
      if (has && /^\d+$/.test(cur)) {
        fd = cur;
        cur = "";
        has = false;
      } else endWord();
      let j = i + 1;
      if (cmd[j] === ">") j++;
      if (cmd[j] === "&") {
        const r = readWord(j + 1);
        i = r.next;
        continue;
      }
      const r = readWord(j);
      i = r.next;
      if (fd !== "2" && r.word) redirects.push(r.word);
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      endWord();
      i++;
      continue;
    }
    cur += c;
    has = true;
    i++;
  }
  endSeg();
  void heredocEnd;
  return segs;
}

const base = (s: string) =>
  path
    .basename(s.replace(/\\/g, "/"))
    .toLowerCase()
    .replace(/\.(exe|cmd|bat|ps1|com)$/, "");

interface InstallInfo {
  mgr: string;
  uninstall: boolean;
  pkgs: string[];
  explicit: boolean; // pkgs list is complete (not "install from package.json / requirements")
  global: boolean;
}
interface Finding {
  cat: Cat;
  targets?: string[]; // delete targets (raw tokens)
  dynamic?: boolean; // targets can't be known from the text
  install?: InstallInfo;
}

const NPM_INST: Record<string, { inst: string[]; un: string[] }> = {
  npm: { inst: ["install", "i", "in", "ins", "inst", "add", "ci", "update", "up", "upgrade", "link", "ln", "rebuild", "dedupe"], un: ["uninstall", "remove", "rm", "r", "un", "unlink"] },
  cnpm: { inst: ["install", "i", "add", "update"], un: ["uninstall", "remove", "rm"] },
  pnpm: { inst: ["add", "install", "i", "update", "up", "upgrade", "link", "ln", "import", "dlx"], un: ["remove", "rm", "uninstall", "un", "unlink"] },
  yarn: { inst: ["add", "install", "upgrade", "up", "global", "dlx", "link", ""], un: ["remove"] },
  bun: { inst: ["add", "install", "i", "update", "link", "x"], un: ["remove", "rm", "unlink"] },
};
const SYS_PM = new Set(["apt", "apt-get", "aptitude", "dnf", "yum", "zypper", "pacman", "apk", "brew", "choco", "winget", "scoop", "snap", "flatpak", "nix-env", "port", "pkg", "emerge", "xbps-install"]);
const SYS_INST = new Set(["install", "add", "upgrade", "dist-upgrade", "full-upgrade", "reinstall", "update-all"]);
const SYS_UN = new Set(["remove", "uninstall", "purge", "autoremove", "del", "erase"]);
const PIP_VALUE_FLAGS = new Set(["-r", "--requirement", "-e", "--editable", "-c", "--constraint", "-i", "--index-url", "--extra-index-url", "-t", "--target", "--prefix", "-f", "--find-links", "--python", "--root", "--src", "--cache-dir", "--proxy"]);

function pkgArgs(args: string[], valueFlags: Set<string>): { pkgs: string[]; explicit: boolean } {
  const pkgs: string[] = [];
  let explicit = true;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("-")) {
      if (a === "-r" || a === "--requirement" || a === "-e" || a === "--editable" || a === "-c" || a === "--constraint") explicit = false;
      if (valueFlags.has(a)) i++;
      continue;
    }
    pkgs.push(a);
  }
  return { pkgs, explicit };
}

function installInfo(name: string, args: string[]): InstallInfo | null {
  const global = args.some((a) => a === "-g" || a === "--global" || a === "global");
  const subIdx = args.findIndex((a) => !a.startsWith("-"));
  const sub = subIdx >= 0 ? args[subIdx].toLowerCase() : "";
  const after = subIdx >= 0 ? args.slice(subIdx + 1) : [];

  if (NPM_INST[name]) {
    const t = NPM_INST[name];
    const un = t.un.includes(sub);
    if (!un && !t.inst.includes(sub)) return null;
    if (name === "yarn" && sub === "" && args.length > 0 && !args.every((a) => a.startsWith("-"))) return null;
    const p = pkgArgs(after.filter((a) => a !== "global"), new Set(["--prefix", "--registry", "-w", "--workspace", "--cwd"]));
    const noPkgsMeansAll = !un && p.pkgs.length === 0;
    return { mgr: name, uninstall: un, pkgs: p.pkgs, explicit: !noPkgsMeansAll && p.explicit, global };
  }
  if (name === "npx" || name === "pnpx" || name === "bunx") {
    const p = args.filter((a) => !a.startsWith("-"))[0];
    return { mgr: "npm", uninstall: false, pkgs: p ? [p] : [], explicit: !!p, global: false };
  }
  if (name === "pip" || name === "pip3" || name === "pipx" || name === "pip3.11" || name === "pip3.12") {
    const un = sub === "uninstall";
    const inst = sub === "install" || sub === "download" || (name === "pipx" && (sub === "run" || sub === "inject" || sub === "upgrade"));
    if (!un && !inst) return null;
    const p = pkgArgs(after, PIP_VALUE_FLAGS);
    return { mgr: "pip", uninstall: un, pkgs: p.pkgs, explicit: p.explicit && p.pkgs.length > 0, global: false };
  }
  if (/^python(\d(\.\d+)?)?$|^py$/.test(name)) {
    const m = args.indexOf("-m");
    if (m >= 0 && args[m + 1] === "pip") return installInfo("pip", args.slice(m + 2));
    return null;
  }
  if (name === "uv") {
    if (sub === "pip") return installInfo("pip", after);
    if (sub === "add") return { mgr: "pip", uninstall: false, ...(() => { const p = pkgArgs(after, new Set()); return { pkgs: p.pkgs, explicit: p.explicit && p.pkgs.length > 0 }; })(), global: false };
    if (sub === "remove") return { mgr: "pip", uninstall: true, pkgs: after.filter((a) => !a.startsWith("-")), explicit: false, global: false };
    if (sub === "sync" || sub === "lock") return { mgr: "pip", uninstall: false, pkgs: [], explicit: false, global: false };
    if (sub === "tool") {
      const s2 = after.find((a) => !a.startsWith("-"));
      if (s2 === "install" || s2 === "upgrade") return { mgr: "pip", uninstall: false, pkgs: [], explicit: false, global: true };
      if (s2 === "uninstall") return { mgr: "pip", uninstall: true, pkgs: [], explicit: false, global: true };
    }
    return null;
  }
  if (name === "uvx") return { mgr: "pip", uninstall: false, pkgs: [], explicit: false, global: false };
  if (name === "poetry" || name === "pdm" || name === "pipenv") {
    if (["add", "install", "update", "sync"].includes(sub)) return { mgr: "pip", uninstall: false, pkgs: [], explicit: false, global: false };
    if (sub === "remove") return { mgr: "pip", uninstall: true, pkgs: [], explicit: false, global: false };
    return null;
  }
  if (name === "conda" || name === "mamba" || name === "micromamba") {
    if (["install", "update", "upgrade"].includes(sub)) return { mgr: name, uninstall: false, pkgs: [], explicit: false, global: false };
    if (["remove", "uninstall"].includes(sub)) return { mgr: name, uninstall: true, pkgs: [], explicit: false, global: false };
    return null;
  }
  if (SYS_PM.has(name)) {
    const first = args[0] || "";
    if (name === "pacman") {
      if (/^-S/.test(first) && !/^-Ss|^-Si|^-Sq/.test(first)) return { mgr: name, uninstall: false, pkgs: [], explicit: false, global: true };
      if (/^-R/.test(first)) return { mgr: name, uninstall: true, pkgs: [], explicit: false, global: true };
      return null;
    }
    if (SYS_INST.has(sub)) return { mgr: name, uninstall: false, pkgs: after.filter((a) => !a.startsWith("-")), explicit: false, global: true };
    if (SYS_UN.has(sub)) return { mgr: name, uninstall: true, pkgs: after.filter((a) => !a.startsWith("-")), explicit: false, global: true };
    return null;
  }
  if (name === "cargo") {
    if (sub === "install" || sub === "add") return { mgr: name, uninstall: false, pkgs: [], explicit: false, global: sub === "install" };
    if (sub === "uninstall" || sub === "remove") return { mgr: name, uninstall: true, pkgs: [], explicit: false, global: sub === "uninstall" };
    return null;
  }
  if (name === "go" && (sub === "install" || sub === "get")) return { mgr: name, uninstall: false, pkgs: [], explicit: false, global: false };
  if (name === "gem" || name === "bundle" || name === "composer" || name === "dotnet" || name === "pecl") {
    if (["install", "add", "require", "update"].includes(sub) || (name === "dotnet" && sub === "tool")) return { mgr: name, uninstall: false, pkgs: [], explicit: false, global: false };
    if (["uninstall", "remove"].includes(sub)) return { mgr: name, uninstall: true, pkgs: [], explicit: false, global: false };
    return null;
  }
  if (/^install-(module|package|script|packageprovider)$/.test(name)) return { mgr: "ps", uninstall: false, pkgs: [], explicit: false, global: true };
  if (/^uninstall-(module|package|script)$/.test(name)) return { mgr: "ps", uninstall: true, pkgs: [], explicit: false, global: true };
  return null;
}

const NULL_TARGETS = /^(\/dev\/(null|stdout|stderr|tty|fd\/\d+)|nul|\$null|&\d+)$/i;
const WRAPPERS = new Set(["sudo", "doas", "time", "nohup", "command", "exec", "nice", "ionice", "stdbuf", "env", "builtin"]);
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish"]);

function classify(cmd: string, cwd: string, depth = 0): Finding[] {
  const out: Finding[] = [];
  if (depth > 3 || !cmd.trim()) return out;

  // command substitutions are commands too
  for (const m of cmd.matchAll(/\$\(([^()]*)\)/g)) out.push(...classify(m[1], cwd, depth + 1));
  for (const m of cmd.matchAll(/`([^`]*)`/g)) out.push(...classify(m[1], cwd, depth + 1));

  for (const seg of splitCommand(cmd)) {
    let t = seg.tokens.slice();
    let viaXargs = false;
    while (t.length) {
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0])) {
        t.shift();
        continue;
      }
      const n = base(t[0]);
      if (WRAPPERS.has(n)) {
        t.shift();
        while (t.length && (t[0].startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0]))) t.shift();
        continue;
      }
      if (n === "xargs") {
        viaXargs = true;
        t.shift();
        while (t.length && t[0].startsWith("-")) t.shift();
        continue;
      }
      break;
    }

    if (t.length) {
      const name = base(t[0]);
      const args = t.slice(1);
      const nonFlag = args.filter((a) => !a.startsWith("-"));
      const sub = (nonFlag[0] || "").toLowerCase();
      const has = (re: RegExp) => args.some((a) => re.test(a));

      // ---- nested shells ----
      if (SHELLS.has(name)) {
        const i = args.findIndex((a) => /^-[a-z]*c$/.test(a));
        if (i >= 0 && args[i + 1]) out.push(...classify(args[i + 1], cwd, depth + 1));
      } else if (name === "powershell" || name === "pwsh") {
        const i = args.findIndex((a) => /^-(c|command)$/i.test(a));
        if (i >= 0) out.push(...classify(args.slice(i + 1).join(" "), cwd, depth + 1));
      } else if (name === "cmd") {
        const i = args.findIndex((a) => /^\/(c|k)$/i.test(a));
        if (i >= 0) out.push(...classify(args.slice(i + 1).join(" "), cwd, depth + 1));
      }

      // ---- delete ----
      const flagLikeWin = (a: string) => WIN && /^\/[a-z?]$/i.test(a);
      if (["rm", "rmdir", "del", "erase", "rd", "unlink", "shred", "trash", "trash-put", "remove-item", "ri"].includes(name)) {
        const targets: string[] = [];
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (/^-(path|literalpath)$/i.test(a)) {
            if (args[i + 1]) targets.push(args[++i]);
            continue;
          }
          if (a.startsWith("-") || flagLikeWin(a)) continue;
          targets.push(a);
        }
        out.push({ cat: "delete", targets, dynamic: viaXargs || targets.length === 0 });
      } else if (name === "git" && sub === "clean") {
        out.push({ cat: "delete", dynamic: true });
      } else if (name === "git" && sub === "rm") {
        out.push({ cat: "delete", targets: nonFlag.slice(1), dynamic: nonFlag.length < 2 });
      } else if (name === "find" && (args.includes("-delete") || (args.includes("-exec") && /(^|\/)(rm|rmdir)$/.test(args[args.indexOf("-exec") + 1] || "")))) {
        out.push({ cat: "delete", dynamic: true });
      }

      // ---- move / rename ----
      if (["mv", "move", "ren", "rename", "move-item", "mi", "rename-item", "rni"].includes(name) || (name === "git" && sub === "mv")) {
        out.push({ cat: "move" });
      }

      // ---- archive ----
      if (["zip", "unzip", "tar", "7z", "7za", "7zr", "7zz", "gzip", "gunzip", "bzip2", "bunzip2", "xz", "unxz", "zstd", "unzstd", "rar", "unrar", "compress-archive", "expand-archive"].includes(name)) {
        out.push({ cat: "archive" });
      } else if (/^python(\d(\.\d+)?)?$|^py$/.test(name) && args[0] === "-m" && (args[1] === "zipfile" || args[1] === "tarfile")) {
        out.push({ cat: "archive" });
      }

      // ---- install / uninstall ----
      const inst = installInfo(name, args);
      if (inst) out.push({ cat: "install", install: inst });

      // ---- create ----
      if (["mkdir", "md", "touch", "new-item", "ni", "mkfifo", "cp", "copy", "copy-item", "cpi", "xcopy", "robocopy", "ln", "fallocate", "virtualenv"].includes(name)) {
        out.push({ cat: "create" });
      } else if (name === "git" && (sub === "clone" || sub === "init" || sub === "worktree")) {
        out.push({ cat: "create" });
      } else if (name === "curl" && has(/^(-[a-zA-Z]*[oOJ][a-zA-Z]*|--output|--remote-name|--create-dirs)$/)) {
        out.push({ cat: "create" });
      } else if (name === "wget" && !(args.includes("-O-") || args.some((a, i) => a === "-O" && args[i + 1] === "-") || has(/^-\w*O-$/))) {
        out.push({ cat: "create" });
      } else if (name === "dd" && has(/^of=/)) {
        out.push({ cat: "create" });
      } else if (name === "cargo" && (sub === "new" || sub === "init")) {
        out.push({ cat: "create" });
      } else if (name === "dotnet" && sub === "new") {
        out.push({ cat: "create" });
      } else if ((name === "npm" || name === "pnpm" || name === "yarn" || name === "bun") && (sub === "init" || sub === "create")) {
        out.push({ cat: "create" });
      } else if (name === "uv" && (sub === "venv" || sub === "init")) {
        out.push({ cat: "create" });
      } else if (/^python(\d(\.\d+)?)?$|^py$/.test(name) && args[0] === "-m" && args[1] === "venv") {
        out.push({ cat: "create" });
      } else if (name === "tee") {
        for (const f of nonFlag) pushWriteTarget(out, f, cwd);
      }

      // ---- edit ----
      if (name === "sed" && has(/^(-[a-zA-Z]*i[a-zA-Z.]*|--in-place(=.*)?)$/)) out.push({ cat: "edit" });
      else if (name === "perl" && has(/^-[a-zA-Z]*i[a-zA-Z.]*$/)) out.push({ cat: "edit" });
      else if (name === "awk" && args.some((a, i) => a === "-i" && /inplace/.test(args[i + 1] || ""))) out.push({ cat: "edit" });
      else if (["set-content", "sc", "add-content", "ac", "out-file", "clear-content", "patch", "sponge", "dos2unix", "unix2dos", "truncate"].includes(name)) out.push({ cat: "edit" });
      else if (name === "git" && ["apply", "am", "restore"].includes(sub)) out.push({ cat: "edit" });
      else if (name === "git" && sub === "reset" && args.includes("--hard")) out.push({ cat: "edit" });
    }

    for (const r of seg.redirects) pushWriteTarget(out, r, cwd);
  }
  return out;
}

function pushWriteTarget(out: Finding[], target: string, cwd: string) {
  if (!target || NULL_TARGETS.test(target)) return;
  if (/[$`]/.test(target)) {
    out.push({ cat: "edit" });
    return;
  }
  const abs = resolveToken(target, cwd);
  out.push({ cat: fs.existsSync(abs) ? "edit" : "create" });
}

function resolveToken(tok: string, cwd: string): string {
  let t = tok;
  if (t === "~" || t.startsWith("~/") || t.startsWith("~\\")) t = path.join(os.homedir(), t.slice(1));
  return path.resolve(cwd, t);
}

// ===========================================================================
// Sizes
// ===========================================================================
interface SizeResult {
  bytes: number;
  exists: boolean;
  complete: boolean;
}

async function sizeOf(p: string, budget = { n: 300000 }): Promise<SizeResult> {
  let st: fs.Stats;
  try {
    st = await fs.promises.lstat(p);
  } catch {
    return { bytes: 0, exists: false, complete: true };
  }
  if (!st.isDirectory()) return { bytes: st.size, exists: true, complete: true };
  let bytes = 0;
  let complete = true;
  let entries: string[] = [];
  try {
    entries = await fs.promises.readdir(p);
  } catch {
    return { bytes: 0, exists: true, complete: false };
  }
  for (const e of entries) {
    if (--budget.n < 0) {
      complete = false;
      break;
    }
    const r = await sizeOf(path.join(p, e), budget);
    bytes += r.bytes;
    if (!r.complete) complete = false;
  }
  return { bytes, exists: true, complete };
}

/** Resolve delete targets (one-level globs supported). unknown=true when we can't tell. */
async function expandTargets(tokens: string[], cwd: string): Promise<{ paths: string[]; unknown: boolean }> {
  const paths: string[] = [];
  let unknown = false;
  for (const tok of tokens) {
    if (/[$`]/.test(tok)) {
      unknown = true;
      continue;
    }
    const abs = resolveToken(tok, cwd);
    const dir = path.dirname(abs);
    const leaf = path.basename(abs);
    if (/[*?[]/.test(dir)) {
      unknown = true;
      continue;
    }
    if (/[*?[]/.test(leaf)) {
      try {
        const re = new RegExp(
          "^" +
            leaf
              .replace(/[.+^${}()|\\]/g, "\\$&")
              .replace(/\*/g, ".*")
              .replace(/\?/g, ".") +
            "$"
        );
        for (const f of await fs.promises.readdir(dir)) if (re.test(f) && !(f.startsWith(".") && !leaf.startsWith("."))) paths.push(path.join(dir, f));
      } catch {
        unknown = true;
      }
    } else paths.push(abs);
  }
  return { paths, unknown };
}

async function fetchJson(url: string, ms = 6000): Promise<any | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Lower-bound estimate (named packages only, not their dependencies). null = can't tell. */
async function estimateInstallBytes(info: InstallInfo): Promise<number | null> {
  if (!info.explicit || info.pkgs.length === 0) return null;
  let total = 0;
  for (const spec of info.pkgs) {
    if (/^(\.|\/|file:|git|http|github:|[a-z]:\\)/i.test(spec) || (spec.includes("/") && !spec.startsWith("@"))) return null;
    if (info.mgr === "npm" || NPM_INST[info.mgr]) {
      const m = spec.match(/^(@?[^@]+)(?:@(.+))?$/);
      if (!m) return null;
      const name = m[1];
      const ver = m[2] && /^\d[\w.\-+]*$/.test(m[2]) ? m[2] : "latest";
      const j = await fetchJson(`https://registry.npmjs.org/${name.replace("/", "%2F")}/${ver}`);
      const sz = j?.dist?.unpackedSize;
      if (typeof sz !== "number") return null;
      total += sz;
    } else if (info.mgr === "pip") {
      const m = spec.match(/^([A-Za-z0-9_.\-]+)(?:\[[^\]]*\])?(?:==([\w.\-+]+))?/);
      if (!m) return null;
      const j = await fetchJson(m[2] ? `https://pypi.org/pypi/${m[1]}/${m[2]}/json` : `https://pypi.org/pypi/${m[1]}/json`);
      const files: any[] = j?.urls || [];
      if (!files.length) return null;
      const wheels = files.filter((f) => f.packagetype === "bdist_wheel");
      const pool = wheels.length ? wheels : files;
      total += Math.min(...pool.map((f) => Number(f.size) || Infinity));
    } else return null;
  }
  return Number.isFinite(total) ? total : null;
}

// ===========================================================================
// Approval queue
// ===========================================================================
export interface PendingApproval {
  id: string;
  command: string;
  cwd: string;
  categories: string[];
  reasons: string[];
  createdAt: number;
}
interface Decision {
  allow: boolean;
  remember: boolean;
}
const pending = new Map<string, { info: PendingApproval; resolve: (d: Decision) => void }>();
let seq = 0;
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

function requestApproval(info: Omit<PendingApproval, "id" | "createdAt">): Promise<Decision & { timedOut?: boolean }> {
  return new Promise((resolve) => {
    const id = `ap${(++seq).toString(36)}${Date.now().toString(36).slice(-4)}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ allow: false, remember: false, timedOut: true });
    }, APPROVAL_TIMEOUT_MS);
    pending.set(id, {
      info: { ...info, id, createdAt: Date.now() },
      resolve: (d) => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(d);
      },
    });
  });
}

// ===========================================================================
// Evaluate
// ===========================================================================
export interface EvalResult {
  ok: boolean;
  message?: string;
  ulimitMb?: number;
  scanBytes?: number;
}

export async function evaluatePermission(command: string, cwd: string, opts: { canUlimit: boolean }): Promise<EvalResult> {
  const cfg = getPerms();
  const findings = classify(command, cwd);
  const cats = new Set<Cat>(findings.map((f) => f.cat));

  for (const c of cats) {
    if (cfg.modes[c] === "deny") {
      return { ok: false, message: `Blocked by the user's permission settings: "${LABEL[c]}" is set to DENY. Don't retry this; use a different approach or tell the user.` };
    }
  }

  const askCats = new Set<Cat>([...cats].filter((c) => cfg.modes[c] === "ask"));
  const modeAsk = new Set(askCats); // categories that asked only because of the mode (eligible for "remember")
  const reasons: string[] = [];

  // ---- delete limit (files, folders, uninstalled libraries) ----
  const delLimit = limitBytes(cfg.limits.maxDeleteMB);
  if (delLimit) {
    let total = 0;
    for (const f of findings) {
      if (f.cat === "delete") {
        if (f.dynamic) {
          askCats.add("delete");
          reasons.push("can't tell from the command how much will be deleted");
          continue;
        }
        const { paths, unknown } = await expandTargets(f.targets || [], cwd);
        if (unknown) {
          askCats.add("delete");
          reasons.push("some delete targets can't be resolved (variables / complex globs)");
        }
        for (const p of paths) {
          const s = await sizeOf(p);
          total += s.bytes;
          if (!s.complete) {
            askCats.add("delete");
            reasons.push(`${path.basename(p)} is too large to measure fully`);
          }
        }
      } else if (f.cat === "install" && f.install?.uninstall) {
        const i = f.install;
        if (i.global || !(NPM_INST[i.mgr] || i.mgr === "npm") || i.pkgs.length === 0) {
          askCats.add("install");
          reasons.push("can't measure how much the uninstall removes");
        } else {
          for (const p of i.pkgs) {
            const s = await sizeOf(path.join(cwd, "node_modules", p.replace(/@[^/]+$/, "")));
            total += s.bytes;
          }
        }
      }
    }
    if (total > delLimit) {
      return { ok: false, message: `Blocked: this would delete about ${fmt(total)}, over the user's limit of ${cfg.limits.maxDeleteMB} MB. Don't retry; tell the user.` };
    }
  }

  // ---- install limit ----
  const insLimit = limitBytes(cfg.limits.maxInstallMB);
  if (insLimit) {
    let total = 0;
    let unknown = false;
    let any = false;
    for (const f of findings) {
      if (f.cat === "install" && f.install && !f.install.uninstall) {
        any = true;
        const b = await estimateInstallBytes(f.install);
        if (b == null) unknown = true;
        else total += b;
      }
    }
    if (any && total > insLimit) {
      return { ok: false, message: `Blocked: the named packages alone are about ${fmt(total)}, over the user's install limit of ${cfg.limits.maxInstallMB} MB. Don't retry; tell the user.` };
    }
    if (any && unknown) {
      askCats.add("install");
      reasons.push("install size can't be verified beforehand");
    }
  }

  // ---- ask the user ----
  if (askCats.size > 0) {
    const d = await requestApproval({ command, cwd, categories: [...askCats].map((c) => LABEL[c]), reasons: [...new Set(reasons)] });
    if (!d.allow) {
      return {
        ok: false,
        message: d.timedOut
          ? "The user did not answer the permission prompt in time, so the command was NOT run. Ask them first, then retry."
          : "The user denied this command. Don't retry it; tell the user what you wanted to do or choose another approach.",
      };
    }
    if (d.remember) {
      const next = getPerms();
      for (const c of modeAsk) next.modes[c] = "allow";
      setPerms(next);
    }
  }

  // ---- create-size limit ----
  const crLimit = limitBytes(cfg.limits.maxCreateMB);
  if (crLimit && !cats.has("install")) {
    return opts.canUlimit ? { ok: true, ulimitMb: crLimit / 1024 / 1024 } : { ok: true, scanBytes: crLimit };
  }
  return { ok: true };
}

// Windows (no ulimit): remove files created during the run that exceed the limit.
const SKIP_DIRS = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", "dist", "build", ".next", "target"]);
export async function removeOversizeNewFiles(root: string, sinceMs: number, limit: number): Promise<string[]> {
  const removed: string[] = [];
  let visits = 0;
  async function walk(dir: string) {
    let ents: fs.Dirent[] = [];
    try {
      ents = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (++visits > 60000) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(full);
      } else if (e.isFile()) {
        try {
          const st = await fs.promises.stat(full);
          if (st.size > limit && st.birthtimeMs >= sinceMs - 1000) {
            await fs.promises.rm(full, { force: true });
            removed.push(`${path.relative(root, full)} (${fmt(st.size)})`);
          }
        } catch {}
      }
    }
  }
  await walk(root);
  return removed;
}

// ===========================================================================
// Routes
// ===========================================================================
export function registerPermissionRoutes(app: Express, requireLocal: RequestHandler) {
  app.get("/api/permissions", requireLocal, (_req, res) => res.json(getPerms()));
  app.post("/api/permissions", requireLocal, (req, res) => res.json(setPerms(req.body)));
  app.get("/api/permissions/pending", requireLocal, (_req, res) => res.json({ pending: [...pending.values()].map((p) => p.info) }));
  app.post("/api/permissions/decide", requireLocal, (req, res) => {
    const { id, allow, remember } = req.body || {};
    const p = pending.get(String(id));
    if (!p) return res.status(404).json({ error: "No such pending request (maybe it already timed out)" });
    p.resolve({ allow: !!allow, remember: !!remember && !!allow });
    return res.json({ ok: true });
  });
}

// exported for tests
export const __test = { classify, splitCommand };
