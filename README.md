# FANLUC — self-hosted (self-host)

Runs on your own machine. The AI executes commands **directly on your
machine** (no sandbox), inside the folder you choose.

## Run

```
npm install
npm run dev          # open http://localhost:3000
```

Requires Node.js 18+. If you want the AI to use python/git/... those
tools must already be installed on the machine (see the `<environment>`
block the AI receives).

## What is different from the old version

1. **Workspace picker**: the `[DIR: folder-name]` button in the header
   opens a folder browser on your machine (path input, recent folders,
   drives, create-new-folder). The choice is remembered in
   `~/.fanluc/config.json`. Force it at startup with `WORKSPACE_DIR`.
2. **No sandbox**: `run_cmd` / `run_cmd_bg` run in your real shell
   (bash on Linux/macOS; Git Bash, then pwsh, then PowerShell on
   Windows), with the real PATH/HOME, network access, a default 2-minute
   timeout (max 10 minutes), and no stdin (commands that ask questions
   fail instead of hanging). The whole process tree is killed on timeout.
   Only a few catastrophic commands are blocked (`rm -rf /`, `mkfs`,
   `dd` to a disk, fork bombs, disk format). Disable even that with
   `FANLUC_UNRESTRICTED=1`.
3. **Better search on localhost**: Bing (machine locale) + DuckDuckGo +
   Mojeek + Yahoo run in parallel, each engine has a timeout, engines
   that keep failing are skipped temporarily, results are merged with
   reciprocal-rank-fusion and cached for 10 minutes. Status:
   `GET /api/search-status`.
4. **Image search without SearXNG**: Bing images + DuckDuckGo images,
   plus Wikimedia Commons + Openverse as fallback. SearXNG is only an
   extra source if you set `SEARXNG_URL`.
5. **MCP**: parallel connections, stdio runs inside the workspace (use
   `${WORKSPACE}` in args), real machine env, stderr reported on error,
   HTTP with SSE retry for old servers, one automatic reconnect when a
   server dies. Quick-add buttons (Playwright, Context7, test server)
   and stdio/http explanations in the form.

## Safety (important)

Because there is no sandbox, **anyone who can reach this port can run
commands on your machine**. Defaults:

- the server only listens on `127.0.0.1`;
- every `/api/*` only accepts requests from localhost, checks the `Host`
  header (anti DNS-rebinding), and rejects requests coming through a
  tunnel (ngrok/cloudflared add `x-forwarded-for`).

To open it to LAN/tunnel: `HOST=0.0.0.0` + `ALLOW_REMOTE_EXEC=1` — only
do this if you understand the risk.

Sub-agents work in `<workspace>/.fanluc/agents/<name>/` (hidden folder,
keeps your project clean).

Environment variables: see `.env.example`.

## Terminal UI (opencode-style)

The same project also ships a full-screen terminal UI:

```
npm run build:all        # build web + CLI + TUI into dist/
node dist/cli.js         # or: npx tsx src/cli/index.ts
```

`fanluc` starts the local server and opens the terminal UI (like the
`fanluc` terminal builds). Flags: `--web` / `--no-tui` for web only,
`--port`, `--host`, `--permission ask|autoEdit|readOnly`, plus an
optional workspace folder argument. In ask mode the terminal asks
inline before file writes, and shell approvals requested by the server
are answered in the terminal too.

## Style rules

- English only.
- No emoji.
- Only two colors: black (`#000000`) and white (`#ffffff`).
