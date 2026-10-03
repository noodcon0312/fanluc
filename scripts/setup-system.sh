#!/usr/bin/env bash
# One-time system tools for running the server WITHOUT Docker.
# (In Docker these are already baked into the image.)
set -euo pipefail
if command -v apt-get >/dev/null; then
  sudo apt-get update
  sudo apt-get install -y --no-install-recommends \
    python3 python3-venv tesseract-ocr tesseract-ocr-eng tesseract-ocr-vie \
    poppler-utils imagemagick pandoc git zip unzip
elif command -v brew >/dev/null; then
  brew install python tesseract tesseract-lang poppler imagemagick pandoc git
else
  echo "Unsupported package manager. Install: python3+venv, tesseract (eng+vie), poppler, imagemagick, pandoc, git." >&2
  exit 1
fi
echo "Done. Start the server, then let the AI run install_pack_v1 to verify."
