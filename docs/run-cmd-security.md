# AI workspace safety (run_cmd / install_pack_v1)

Layers, from the inside out:

1. **cwd jail** – every command starts in the workspace dir; new process each call.
2. **Stripped env** – API keys of the server are never passed to commands.
3. **Blocklist** – sudo, destructive rm, `/proc/*/environ`, docker.sock, .env, reverse shells, cron…
4. **Unprivileged user** – if the server runs as root (Docker, or a VPS), every command is dropped to a non-root uid: `SANDBOX_UID` (Docker: 10001) or `nobody` (65534) by default. It cannot read the server's environment/`.env` (chmod 600 at startup) or modify the venv. Never runs AI commands as root.
5. **firejail (optional)** – `--net=none`, no caps, seccomp, read-only venv, size/memory limits.
6. **Container** – `docker compose up`: no-new-privileges, capabilities dropped, memory/pid limits.
7. **Timeouts + output caps** – 20 s / 2 MB per command.

## Installing libraries
The jail has no network and no root, so the **server** installs on the AI's behalf:
- `install_pack_v1` – really verifies the 14 essential packages (+ tesseract `vie`; includes zip/unzip), repairs what it may, prints OK/MISSING. Concurrent calls share one run.
- `pip install <pkg>` / `pip install -U <pkg>` typed in `run_cmd` is intercepted: plain PyPI names only, **wheels only** (no build scripts run), installed into a read-only venv. URLs, `-r`, `-e`, custom indexes are refused.
- `apt-get install` works only as root (or with passwordless `sudo -n`; set `DISABLE_SUDO_APT=1` to opt out), only for an allowlist (`installer.ts`), otherwise the AI is told to ask the operator. The install is tried first and `apt-get update` only runs if apt cannot find the package.
- pip/apt fail fast on a dead network (20 s timeout, 2 retries) and report a network hint. One bad package in a batch no longer blocks the others.
- Proxy / mirror / CA variables of the server (`HTTP(S)_PROXY`, `NO_PROXY`, `PIP_INDEX_URL`, `PIP_EXTRA_INDEX_URL`, `PIP_TRUSTED_HOST`, `PIP_CERT`, `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`) are passed to the installer (never to AI commands).

`DISABLE_RUN_CMD=1` turns all of it off.

## Self-healing (server side, no user action needed)
- venv without pip (missing `python3-venv`) -> detected, rebuilt; installs `python3-venv` when root.
- `dpkg was interrupted` -> runs `dpkg --configure -a`, retries; broken deps -> `apt-get -f install`.
- apt lock held by another process -> waits up to 120 s.
