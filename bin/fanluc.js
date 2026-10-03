#!/usr/bin/env node
// Wrapper for `fanluc` CLI — works on Windows (PowerShell/cmd) + Unix
// Tries dist/cli.cjs (built), else falls back to tsx src/cli/index.ts, else src/cli/index.ts via node --loader tsx

import { spawnSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const distCliEsm = path.join(projectRoot, "dist", "cli.js");
const distCliCjs = path.join(projectRoot, "dist", "cli.cjs");
const srcCli = path.join(projectRoot, "src", "cli", "index.ts");

function trySpawn(entry, args, opts) {
  const child = spawn(entry, args, opts);
  child.on("error", (e) => {
    console.error(`[fanluc] spawn error: ${e.message}`);
    process.exit(1);
  });
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => {
      try { child.kill(sig); } catch {}
    });
  }
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
  return child;
}

// Prefer built CLI (esm first, then cjs fallback)
const distCli = fs.existsSync(distCliEsm) ? distCliEsm : (fs.existsSync(distCliCjs) ? distCliCjs : null);
if (distCli) {
  trySpawn(process.execPath, [distCli, ...process.argv.slice(2)], { stdio: "inherit" });
} else if (fs.existsSync(srcCli)) {
  // Try local tsx bin
  const tsxBin = path.join(projectRoot, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  const tsxExists = fs.existsSync(tsxBin) || fs.existsSync(path.join(projectRoot, "node_modules", ".bin", "tsx"));
  if (tsxExists) {
    const cmd = fs.existsSync(tsxBin) ? tsxBin : path.join(projectRoot, "node_modules", ".bin", "tsx");
    trySpawn(cmd, [srcCli, ...process.argv.slice(2)], { stdio: "inherit", shell: false });
  } else {
    // Fallback to npx tsx
    trySpawn("npx", ["tsx", srcCli, ...process.argv.slice(2)], { stdio: "inherit", shell: true });
  }
} else {
  console.error(`[fanluc] Cannot find CLI entry. Looked for ${distCli} and ${srcCli}`);
  process.exit(1);
}
