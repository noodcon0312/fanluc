// ============================================================================
// installer.ts — REAL package install / verify / update for the AI workspace.
//
// Why this exists: the AI's run_cmd sandbox has no network (firejail --net=none)
// and no root, so `pip install` / `apt-get install` typed by the AI can never
// work from inside it. Instead, the *server* performs installs on the AI's
// behalf, but only through the strict, allowlisted paths below:
//
//   • Python libs  -> installed into a dedicated venv (SANDBOX_VENV), wheels
//                     only (--only-binary=:all: => no setup.py / build scripts
//                     ever execute at install time), package specs validated.
//                     The venv is put first on PATH for every run_cmd, and is
//                     mounted read-only inside the jail, so the AI can use the
//                     libs but cannot tamper with them.
//   • System tools -> `apt-get install` ONLY when the server runs as root
//                     (i.e. inside the Docker image) or has passwordless sudo
//                     (`sudo -n`, opt out with DISABLE_SUDO_APT=1) AND the package
//                     is on APT_ALLOW / matches tesseract-ocr-<lang>. Otherwise we
//                     report exactly what is missing and how to fix it.
//   • Arbitrary shell strings from the AI are NEVER passed to pip/apt: we parse
//     them, validate every token, and call execFile with an argv array.
// ============================================================================

import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

// ---------------------------------------------------------------- config ----

export const SANDBOX_VENV: string = (() => {
  if (process.env.SANDBOX_VENV) return process.env.SANDBOX_VENV;
  try {
    fs.accessSync("/opt", fs.constants.W_OK);
    return "/opt/sandbox-venv";
  } catch {
    return path.join(process.cwd(), ".sandbox-venv");
  }
})();

const VENV_BIN = path.join(SANDBOX_VENV, "bin");
const VENV_PY = path.join(VENV_BIN, "python");

/** PATH for AI commands: venv first, then the server's own PATH. */
export function sandboxPath(basePath: string | undefined): string {
  return [VENV_BIN, basePath || "/usr/local/bin:/usr/bin:/bin"].join(path.delimiter);
}

const IS_ROOT = typeof process.getuid === "function" && process.getuid() === 0;

interface SystemTool {
  bin: string | string[]; // first one found wins (e.g. imagemagick 6 vs 7)
  apt: string;
  versionArgs: string[];
  purpose: string;
}

export const SYSTEM_TOOLS: SystemTool[] = [
  { bin: "tesseract", apt: "tesseract-ocr", versionArgs: ["--version"], purpose: "OCR: extract text from images" },
  { bin: "pdftotext", apt: "poppler-utils", versionArgs: ["-v"], purpose: "PDF text/image extraction" },
  { bin: ["magick", "convert"], apt: "imagemagick", versionArgs: ["-version"], purpose: "image convert/resize/crop" },
  { bin: "pandoc", apt: "pandoc", versionArgs: ["--version"], purpose: "document format conversion" },
  { bin: "git", apt: "git", versionArgs: ["--version"], purpose: "version control / diffs" },
  { bin: "zip", apt: "zip", versionArgs: ["-v"], purpose: "create .zip archives" },
  { bin: "unzip", apt: "unzip", versionArgs: ["-v"], purpose: "extract .zip archives" },
];

/** Tesseract language packs the pack guarantees (Vietnamese is the reason OCR failed on vie files). */
export const REQUIRED_TESS_LANGS = ["eng", "vie"];

export interface PyLib {
  pip: string; // name on PyPI
  mod: string; // import name
  purpose: string;
}

export const PY_LIBS: PyLib[] = [
  { pip: "numpy", mod: "numpy", purpose: "numerical arrays" },
  { pip: "pandas", mod: "pandas", purpose: "CSV/Excel tabular data" },
  { pip: "openpyxl", mod: "openpyxl", purpose: "read/write .xlsx" },
  { pip: "python-docx", mod: "docx", purpose: "read/write .docx" },
  { pip: "beautifulsoup4", mod: "bs4", purpose: "HTML/XML parsing" },
  { pip: "lxml", mod: "lxml", purpose: "fast XML/HTML parser" },
  { pip: "matplotlib", mod: "matplotlib", purpose: "charts / plots" },
];

const APT_ALLOW = new Set([
  "tesseract-ocr", "poppler-utils", "imagemagick", "pandoc", "git", "zip", "unzip",
  "ghostscript", "ffmpeg", "jq", "sqlite3", "ripgrep", "tree", "python3-venv", "python3-pip",
]);
const APT_TESS_LANG = /^tesseract-ocr-[a-z]{3}(-[a-z]+)?$/;

// PyPI name, optional [extras], optional single version constraint.
const PIP_SPEC = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}(\[[A-Za-z0-9,._-]{1,60}\])?((==|>=|<=|~=|!=|<|>)[A-Za-z0-9.*+!_-]{1,40})?$/;
const APT_NAME = /^[a-z0-9][a-z0-9+.-]{1,60}$/;

// ---------------------------------------------------------------- helpers ---

interface RunResult { code: number; stdout: string; stderr: string; timedOut: boolean }

function run(bin: string, args: string[], opts: { timeoutMs: number; env?: NodeJS.ProcessEnv; cwd?: string }): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { timeout: opts.timeoutMs, maxBuffer: 8 * 1024 * 1024, env: opts.env, cwd: opts.cwd },
      (err: any, stdout, stderr) => {
        resolve({
          code: err ? (typeof err.code === "number" ? err.code : 1) : 0,
          stdout: String(stdout || ""),
          stderr: String(stderr || (err && !err.code ? err.message : "")),
          timedOut: !!(err && err.killed),
        });
      }
    );
  });
}

const tail = (s: string, n = 1500) => (s.length > n ? "…" + s.slice(-n) : s).trim();

// Only one install operation at a time (pip/apt lock files, avoids racing AI calls).
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn);
  queue = p.catch(() => {});
  return p;
}

// Proxy / mirror / CA settings the OPERATOR configured for the server. Without these a
// server behind a proxy (or using a PyPI mirror) can never reach the network from pip/apt.
const PASSTHROUGH_ENV_KEYS = [
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
  "http_proxy", "https_proxy", "all_proxy", "no_proxy",
  "PIP_INDEX_URL", "PIP_EXTRA_INDEX_URL", "PIP_TRUSTED_HOST", "PIP_CERT", "PIP_PROXY",
  "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE",
];
const PASSTHROUGH_ENV: Record<string, string> = {};
for (const k of PASSTHROUGH_ENV_KEYS) {
  const v = process.env[k];
  if (v) PASSTHROUGH_ENV[k] = v;
}

const INSTALL_ENV: NodeJS.ProcessEnv = {
  ...PASSTHROUGH_ENV,
  PATH: process.env.PATH,
  HOME: os.tmpdir(),
  LANG: "C.UTF-8",
  PIP_DISABLE_PIP_VERSION_CHECK: "1",
  PIP_NO_INPUT: "1",
  DEBIAN_FRONTEND: "noninteractive",
};

// ------------------------------------------------------------- privileges ----
// System packages need root. Inside Docker the server is root; on a normal host we can use
// passwordless sudo (`sudo -n`, never prompts) unless the operator opted out.
let sudoProbe: Promise<boolean> | null = null;
function canSudo(): Promise<boolean> {
  if (IS_ROOT || process.env.DISABLE_SUDO_APT === "1") return Promise.resolve(false);
  if (!sudoProbe) {
    sudoProbe = run("sudo", ["-n", "true"], { timeoutMs: 5000, env: { PATH: process.env.PATH } }).then((r) => r.code === 0);
  }
  return sudoProbe;
}
async function canInstallSystemPackages(): Promise<boolean> {
  return IS_ROOT || (await canSudo());
}
/** Runs a system command (apt-get / dpkg) as root: directly, or through `sudo -n env ...`. */
function runPrivileged(cmd: string, args: string[], timeoutMs: number): Promise<RunResult> {
  if (IS_ROOT) return run(cmd, args, { timeoutMs, env: INSTALL_ENV });
  const envArgs = ["DEBIAN_FRONTEND=noninteractive", ...Object.entries(PASSTHROUGH_ENV).map(([k, v]) => `${k}=${v}`)];
  return run("sudo", ["-n", "env", ...envArgs, cmd, ...args], { timeoutMs, env: { PATH: process.env.PATH } });
}

async function findBin(name: string): Promise<string | null> {
  const r = await run("which", [name], { timeoutMs: 5000, env: { PATH: process.env.PATH } });
  return r.code === 0 ? r.stdout.trim().split("\n")[0] : null;
}

// ------------------------------------------------------------------ venv ----

type VenvStatus = "ok" | "broken" | "unknown";

async function venvStatus(): Promise<VenvStatus> {
  if (!fs.existsSync(VENV_PY)) return "broken";
  // A venv created without python3-venv has `python` but NO pip -> must be treated as broken.
  const r = await run(VENV_PY, ["-m", "pip", "--version"], { timeoutMs: 60000, env: INSTALL_ENV });
  if (r.code === 0) return "ok";
  // A slow/hung check is NOT proof the venv is broken; never delete a working venv (and all its libs) for that.
  return r.timedOut ? "unknown" : "broken";
}

async function venvHealthy(): Promise<boolean> {
  return (await venvStatus()) === "ok";
}

function removeBrokenVenv(): void {
  // Safety: only ever delete a directory that is clearly a venv dir of ours.
  const resolved = path.resolve(SANDBOX_VENV);
  if (resolved === "/" || resolved.split(path.sep).length < 3 || !/venv/i.test(path.basename(resolved))) return;
  try { fs.rmSync(resolved, { recursive: true, force: true }); } catch { /* ignore */ }
}

async function ensureVenv(): Promise<string | null> {
  const status = await venvStatus();
  if (status !== "broken") return null; // "unknown" (check timed out): keep the venv, pip will report real errors
  removeBrokenVenv();

  let r = await run("python3", ["-m", "venv", SANDBOX_VENV], { timeoutMs: 120000, env: INSTALL_ENV });
  if (!(await venvHealthy()) && (await canInstallSystemPackages())) {
    // Debian/Ubuntu ship venv support in a separate package. We may install system packages here, so do it.
    removeBrokenVenv();
    const apt = await aptInstallRaw(["python3-venv"]);
    if (apt.ok) r = await run("python3", ["-m", "venv", SANDBOX_VENV], { timeoutMs: 120000, env: INSTALL_ENV });
    else r = { ...r, stderr: `${r.stderr}\n(auto-install of python3-venv failed: ${apt.text})` };
  }
  if (!(await venvHealthy())) {
    removeBrokenVenv();
    return (
      "Could not create a working Python environment (" + SANDBOX_VENV + "). " +
      "The server operator must install venv support (Debian/Ubuntu: apt-get install python3-venv) or use the provided Dockerfile.\n" +
      tail(r.stderr || r.stdout, 500)
    );
  }
  // Make the venv world-readable/executable so the unprivileged sandbox user can use it.
  await run("chmod", ["-R", "a+rX", SANDBOX_VENV], { timeoutMs: 60000, env: INSTALL_ENV });
  return null;
}

// ------------------------------------------------------------ pip / apt -----

export function validatePipSpecs(specs: string[]): string | null {
  if (specs.length === 0) return "No package names given.";
  if (specs.length > 30) return "Too many packages in one call (max 30).";
  for (const s of specs) {
    if (!PIP_SPEC.test(s)) {
      return `Rejected package spec "${s}". Only plain PyPI names with an optional version (e.g. pandas, "numpy>=1.26") are allowed — no URLs, paths, git+, -r/-e, or custom indexes.`;
    }
  }
  return null;
}

// pip reports an unreachable index as "No matching distribution" after several "Retrying" lines,
// so network problems have to be recognised first or they look like a bad package name.
const NETWORK_FAILURE = /retrying|connection (?:error|refused|reset|aborted)|newconnectionerror|max retries|temporary failure|name or service not known|name resolution|network is unreachable|timed out|proxyerror|ssl(?:error)?\b|certificate verify|no route to host/i;

const PIP_NETWORK_HINT =
  "\n(Network problem: pip could not reach the package index. Check the server's internet access, or set HTTPS_PROXY / PIP_INDEX_URL " +
  "(a PyPI mirror) in the server environment.)";

function pipArgs(specs: string[], upgrade: boolean): string[] {
  return [
    "-m", "pip", "install",
    "--disable-pip-version-check", "--no-input", "--no-cache-dir",
    "--only-binary=:all:", // wheels only: no setup.py / build code runs during install
    "--timeout", "20", "--retries", "2", // fail fast on a dead network instead of hanging for minutes
    ...(upgrade ? ["-U"] : []),
    ...specs,
  ];
}

function describePipFailure(r: RunResult): string {
  const out = tail(r.stderr || r.stdout);
  if (NETWORK_FAILURE.test(out)) return out + PIP_NETWORK_HINT;
  if (/no matching distribution|could not find a version/i.test(out)) {
    return out + "\n(Note: only prebuilt wheels are allowed for safety. This package may have no wheel for this platform, or the name is wrong.)";
  }
  return out;
}

export async function pipInstall(specs: string[], upgrade: boolean): Promise<{ ok: boolean; text: string }> {
  const bad = validatePipSpecs(specs);
  if (bad) return { ok: false, text: bad };
  return serialize(async () => {
    const venvErr = await ensureVenv();
    if (venvErr) return { ok: false, text: venvErr };
    const fixPerms = () => run("chmod", ["-R", "a+rX", SANDBOX_VENV], { timeoutMs: 60000, env: INSTALL_ENV });

    // 1) Everything in one go (fastest: one resolver run, shared downloads).
    const first = await run(VENV_PY, pipArgs(specs, upgrade), { timeoutMs: 300000, env: INSTALL_ENV });
    if (first.code === 0) {
      await fixPerms();
      return { ok: true, text: tail(first.stdout, 800) };
    }
    if (first.timedOut) return { ok: false, text: "pip timed out after 300s." + PIP_NETWORK_HINT };
    const firstOut = tail(first.stderr || first.stdout);
    // One bad package must not block the others, but retrying one-by-one is pointless if the network is down.
    if (specs.length === 1 || NETWORK_FAILURE.test(firstOut)) {
      await fixPerms();
      return { ok: false, text: describePipFailure(first) };
    }

    // 2) Fallback: one package at a time, so the good ones still get installed.
    const installed: string[] = [];
    const failed: string[] = [];
    for (const spec of specs) {
      const r = await run(VENV_PY, pipArgs([spec], upgrade), { timeoutMs: 180000, env: INSTALL_ENV });
      if (r.code === 0) {
        installed.push(spec);
        continue;
      }
      failed.push(`${spec}: ${r.timedOut ? "timed out" : describePipFailure(r).split("\n")[0]}`);
      if (r.timedOut || NETWORK_FAILURE.test(tail(r.stderr || r.stdout))) break; // network went away, stop early
    }
    await fixPerms();
    const parts: string[] = [];
    if (installed.length) parts.push(`installed: ${installed.join(", ")}`);
    if (failed.length) parts.push(`FAILED: ${failed.join(" | ")}`);
    return { ok: failed.length === 0, text: parts.join("\n") };
  });
}

export function validateAptPackages(pkgs: string[]): string | null {
  if (pkgs.length === 0) return "No package names given.";
  for (const p of pkgs) {
    if (!APT_NAME.test(p) || !(APT_ALLOW.has(p) || APT_TESS_LANG.test(p))) {
      return `Package "${p}" is not on the allowed system-package list (${[...APT_ALLOW].join(", ")}, tesseract-ocr-<lang>).`;
    }
  }
  return null;
}

// Fail fast on a dead mirror instead of hanging: 2 retries, 20s connect/read timeout.
const APT_NET_OPTS = ["-o", "DPkg::Lock::Timeout=120", "-o", "Acquire::Retries=2", "-o", "Acquire::http::Timeout=20", "-o", "Acquire::https::Timeout=20"];

/** Real apt work. NOT serialized and NOT validated — callers must do both. Needs root or `sudo -n`. */
async function aptInstallRaw(pkgs: string[]): Promise<{ ok: boolean; text: string }> {
  const notes: string[] = [];
  const install = () =>
    runPrivileged("apt-get", [...APT_NET_OPTS, "install", "-y", "--no-install-recommends", ...pkgs], 600000);

  // Try the install FIRST: when the package index is already fresh this skips a slow
  // `apt-get update` entirely. Only refresh the index if apt says it cannot find the package.
  let r = await install();
  const combined = () => `${r.stdout}\n${r.stderr}`;
  if (r.code !== 0 && /unable to locate package|has no installation candidate|404\s+not found|failed to fetch/i.test(combined())) {
    const upd = await runPrivileged("apt-get", [...APT_NET_OPTS, "update", "-qq"], 120000);
    // A single unreachable third-party repo makes `update` exit non-zero even though
    // the main indexes refreshed fine, so don't abort here — the install decides.
    if (upd.code !== 0) notes.push("apt-get update reported errors; continuing");
    r = await install();
  }

  // Self-heal an interrupted dpkg (e.g. an earlier apt run was killed by a timeout).
  if (r.code !== 0 && /dpkg was interrupted|dpkg --configure -a/i.test(combined())) {
    const fix = await runPrivileged("dpkg", ["--configure", "-a", "--force-confold"], 600000);
    notes.push(fix.code === 0 ? "repaired interrupted dpkg (dpkg --configure -a)" : "dpkg --configure -a failed: " + tail(fix.stderr || fix.stdout, 300));
    r = await install();
  }
  // Half-installed/broken dependencies.
  if (r.code !== 0 && /unmet dependencies|broken packages|apt --fix-broken|apt-get -f install/i.test(combined())) {
    await runPrivileged("apt-get", [...APT_NET_OPTS, "install", "-f", "-y"], 600000);
    notes.push("ran apt-get -f install to fix broken dependencies");
    r = await install();
  }

  const prefix = notes.length ? `(${notes.join("; ")})\n` : "";
  if (r.timedOut) return { ok: false, text: prefix + "apt-get timed out." };
  if (r.code !== 0) return { ok: false, text: prefix + tail(r.stderr || r.stdout) };
  return { ok: true, text: prefix + "apt-get installed: " + pkgs.join(", ") };
}

export async function aptInstall(pkgs: string[]): Promise<{ ok: boolean; text: string }> {
  const bad = validateAptPackages(pkgs);
  if (bad) return { ok: false, text: bad };
  if (!(await canInstallSystemPackages())) {
    return {
      ok: false,
      text:
        `System packages (${pkgs.join(", ")}) can't be installed at runtime: this server is not root and has no passwordless sudo. ` +
        `They must be added to the image/host by the operator (Dockerfile, or scripts/setup-system.sh). ` +
        `Python libraries can still be installed with pip.`,
    };
  }
  return serialize(() => aptInstallRaw(pkgs));
}

// ---------------------------------------------------------------- verify ----

interface Report {
  tools: { name: string; apt: string; ok: boolean; version: string; purpose: string }[];
  langs: { missing: string[]; present: string[]; checked: boolean };
  libs: { pip: string; ok: boolean; version: string; purpose: string }[];
}

async function verify(): Promise<Report> {
  const tools: Report["tools"] = [];
  for (const t of SYSTEM_TOOLS) {
    const names = Array.isArray(t.bin) ? t.bin : [t.bin];
    let found: string | null = null;
    for (const n of names) {
      if (await findBin(n)) { found = n; break; }
    }
    let version = "";
    if (found) {
      const r = await run(found, t.versionArgs, { timeoutMs: 8000, env: { PATH: process.env.PATH, LANG: "C.UTF-8" } });
      // First line that carries a version number (`zip -v` opens with a copyright line).
      const lines = (r.stdout || r.stderr).split("\n").map((l) => l.trim()).filter(Boolean);
      version = (lines.find((l) => /\d/.test(l) && !/^copyright/i.test(l)) || lines[0] || "").slice(0, 80);
    }
    tools.push({ name: found || names[0], apt: t.apt, ok: !!found, version, purpose: t.purpose });
  }

  const langs: Report["langs"] = { missing: [], present: [], checked: false };
  if (tools[0].ok) {
    const r = await run("tesseract", ["--list-langs"], { timeoutMs: 8000, env: { PATH: process.env.PATH } });
    const have = new Set((r.stdout + "\n" + r.stderr).split("\n").map((l) => l.trim()));
    langs.checked = true;
    for (const l of REQUIRED_TESS_LANGS) (have.has(l) ? langs.present : langs.missing).push(l);
  }

  const libs: Report["libs"] = PY_LIBS.map((l) => ({ pip: l.pip, ok: false, version: "", purpose: l.purpose }));
  if (fs.existsSync(VENV_PY)) {
    const script =
      "import importlib,importlib.metadata as m,json,sys\n" +
      "out={}\n" +
      "for pip,mod in json.loads(sys.argv[1]):\n" +
      "    try:\n" +
      "        importlib.import_module(mod); out[pip]=m.version(pip)\n" +
      "    except Exception: out[pip]=None\n" +
      "print(json.dumps(out))";
    const r = await run(VENV_PY, ["-c", script, JSON.stringify(PY_LIBS.map((l) => [l.pip, l.mod]))], {
      timeoutMs: 60000,
      env: { PATH: process.env.PATH, HOME: os.tmpdir(), MPLBACKEND: "Agg", MPLCONFIGDIR: path.join(os.tmpdir(), "mpl") },
    });
    try {
      const parsed = JSON.parse(r.stdout.trim().split("\n").pop() || "{}");
      for (const l of libs) {
        if (parsed[l.pip]) { l.ok = true; l.version = String(parsed[l.pip]); }
      }
    } catch { /* leave as not-ok */ }
  }
  return { tools, langs, libs };
}

// ------------------------------------------------------------ install_pack --

// The AI may call install_pack_v1 twice (or the UI retries): share one running install instead of
// stacking a second verify/pip/apt pass on top of the first.
let packInFlight: Promise<string> | null = null;
export function installPack(): Promise<string> {
  if (!packInFlight) packInFlight = installPackImpl().finally(() => { packInFlight = null; });
  return packInFlight;
}

async function installPackImpl(): Promise<string> {
  const steps: string[] = [];
  let rep = await verify();

  // 1) Python libs — the server can always repair these.
  const missingLibs = rep.libs.filter((l) => !l.ok).map((l) => l.pip);
  if (missingLibs.length) {
    const r = await pipInstall(missingLibs, false);
    steps.push(r.ok ? `pip: installed ${missingLibs.join(", ")}` : `pip FAILED for ${missingLibs.join(", ")}:\n${r.text}`);
  }

  // 2) System tools — only possible as root (Docker image) or with passwordless sudo.
  const aptSet = new Set<string>();
  for (const t of rep.tools) if (!t.ok) aptSet.add(t.apt);
  const langsToAdd = rep.tools[0].ok ? rep.langs.missing : REQUIRED_TESS_LANGS;
  for (const l of langsToAdd) aptSet.add(`tesseract-ocr-${l}`);
  const missingApt = [...aptSet];
  if (missingApt.length) {
    let r = await aptInstall(missingApt);
    if (r.ok) {
      steps.push(`apt: installed ${missingApt.join(", ")}`);
    } else if (missingApt.length > 1 && !/not root|not on the allowed/i.test(r.text)) {
      // apt-get is all-or-nothing: one unavailable package fails the whole batch. Retry one by one.
      const done: string[] = [];
      const failed: string[] = [];
      for (const pkg of missingApt) {
        const one = await aptInstall([pkg]);
        (one.ok ? done : failed).push(one.ok ? pkg : `${pkg} (${one.text.split("\n").pop()})`);
      }
      if (done.length) steps.push(`apt: installed ${done.join(", ")}`);
      if (failed.length) steps.push(`system packages missing: ${failed.join("; ")}`);
    } else {
      steps.push(`system packages missing (${missingApt.join(", ")}):\n${r.text}`);
    }
  }

  if (missingLibs.length || missingApt.length) rep = await verify();

  // ---- report
  const okTools = rep.tools.filter((t) => t.ok).length;
  const okLibs = rep.libs.filter((l) => l.ok).length;
  const total = rep.tools.length + rep.libs.length;
  const okAll = okTools + okLibs;
  const langOk = rep.langs.checked && rep.langs.missing.length === 0;
  const allGood = okAll === total && langOk;

  const lines: string[] = [];
  lines.push(`[INSTALL_PACK_V1 STATUS: ${allGood ? "SUCCESS" : "PARTIAL"}]  (${okAll}/${total} packages verified for real)`);
  lines.push("", "System tools:");
  for (const t of rep.tools) lines.push(`- ${t.ok ? "OK     " : "MISSING"} ${t.name} — ${t.purpose}${t.version ? ` [${t.version}]` : ""}`);
  lines.push(
    rep.langs.checked
      ? `- tesseract languages: ${rep.langs.present.join(", ") || "none"}${rep.langs.missing.length ? `  | MISSING: ${rep.langs.missing.join(", ")}` : ""}`
      : "- tesseract languages: could not check (tesseract missing)"
  );
  lines.push("", "Python libraries (venv on PATH; `python3` already uses them):");
  for (const l of rep.libs) lines.push(`- ${l.ok ? "OK     " : "MISSING"} ${l.pip} — ${l.purpose}${l.version ? ` [${l.version}]` : ""}`);
  if (steps.length) lines.push("", "Actions taken:", ...steps.map((s) => "- " + s));
  lines.push(
    "",
    allGood
      ? "Environment ready. Need another Python library? Run `run_cmd{ pip install <name> }` (or `pip install -U <name>` to update) — the server handles it safely."
      : "Environment NOT fully ready. Do not claim success. Tell the user which items are MISSING; system tools must be added by the server operator (Dockerfile / scripts/setup-system.sh), or the server needs root / passwordless sudo."
  );
  return lines.join("\n");
}

// ------------------------------------------- run_cmd package interception ---

export interface PkgIntercept {
  handled: boolean;
  formattedText?: string;
  ok?: boolean;
  /** Remaining command to run normally after a successful leading install (`pip install x && python3 a.py`). */
  rest?: string;
}

const LEADING_PKG = /^\s*(?:sudo\s+)?(?:(pip3?|python3?\s+-m\s+pip)|(apt-get|apt))\s+(install|upgrade|update|uninstall|remove|purge)\b([^\n;&|]*)(?:(?:&&|;|\n)([\s\S]*))?$/i;
const NON_LEADING_PKG = /(?:&&|;|\|\||\|)\s*(?:sudo\s+)?(?:pip3?|python3?\s+-m\s+pip|apt-get|apt)\s+(?:install|uninstall|remove|purge)\b/i;

function stripQuotes(t: string): string {
  return t.replace(/^(["'])(.*)\1$/, "$2");
}

export async function interceptPackageCommand(command: string): Promise<PkgIntercept> {
  const m = LEADING_PKG.exec(command);
  if (!m) {
    if (NON_LEADING_PKG.test(command)) {
      return {
        handled: true,
        ok: false,
        formattedText:
          `$ ${command}\nPackage installs must be the FIRST command of a run_cmd (e.g. "pip install pandas && python3 script.py"), ` +
          `not chained after other commands. Split it into two run_cmd calls.`,
      };
    }
    return { handled: false };
  }

  const isPip = !!m[1];
  const verb = m[3].toLowerCase();
  const argTokens = (m[4] || "").trim().split(/\s+/).filter(Boolean).map(stripQuotes);
  const rest = (m[5] || "").trim();
  const shown = `$ ${command.split("\n")[0].trim()}`;
  const fail = (msg: string): PkgIntercept => ({ handled: true, ok: false, formattedText: `${shown}\n${msg}` });

  // Flags we understand/ignore vs. flags we refuse.
  const specs: string[] = [];
  let upgrade = verb === "upgrade";
  for (const tok of argTokens) {
    if (tok === "-U" || tok === "--upgrade") upgrade = true;
    else if (["-y", "--yes", "-q", "-qq", "--quiet", "--break-system-packages", "--user", "--no-cache-dir", "--no-install-recommends", "-f"].includes(tok)) continue;
    else if (tok.startsWith("-")) return fail(`Option "${tok}" is not allowed. Supported: -U/--upgrade, -y, -q. Plain package names only.`);
    else specs.push(tok);
  }

  if (["uninstall", "remove", "purge"].includes(verb)) {
    return fail("Removing packages is not supported. The environment is managed by the server; ask the operator if something must be removed.");
  }
  if (!isPip && verb === "update") {
    return { handled: true, ok: true, formattedText: `${shown}\n(apt package index refresh is done automatically by the server when installing.)`, rest };
  }
  if (isPip && verb === "update") return fail('Unknown pip command "update". Use `pip install -U <package>`.');
  if (!isPip && verb === "upgrade") return fail("`apt upgrade` is not allowed. Install specific packages with `apt-get install -y <package>`.");

  const res = isPip ? await pipInstall(specs, upgrade) : await aptInstall(specs);
  const text = `${shown}\n${res.ok ? "OK — " : "FAILED — "}${res.text || "(no output)"}`;
  if (!res.ok) return { handled: true, ok: false, formattedText: text };
  return { handled: true, ok: true, formattedText: text, rest };
}
