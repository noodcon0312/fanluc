# Test prompt for opencode (paste into opencode, no build needed by author)

Verify the upgraded fanluc project at `D:/opencode-file/fanluc-upgraded`
without building: static checks only.

## 1. Rule compliance

1. Search the whole repo (excluding `node_modules`, `dist`) for symbols
   in ranges U+2600-U+27FF, U+2B00-U+2BFF, U+FE0F, U+1F000-U+1FAFF.
   Expect: zero hits, except U+27E6/U+27E7 (`turnDelimiter.ts`, math
   brackets used as protocol delimiters - allowed).
2. Search for Vietnamese diacritics. Expect: zero hits outside
   `package-lock.json`.
3. Search for hex colors other than `#000000` and `#ffffff`
   (case-insensitive) in `src/`, `index.html`, `server.ts`.
   Expect: zero hits. Report any hit with file and line number.
4. Search for Tailwind color utilities (`bg-red-`, `text-blue-`,
   `border-green-`, etc.) in `src/`. Expect: zero hits.
5. Search Ink `color=` props for anything but `white`/`black`.
   Expect: zero hits (dim/bold only).

## 2. Parity with the reference

Reference: `C:/Users/DELL/AppData/Local/Temp/opencode/ngork-ref`
(which is `D:/opencode-file/npm-fanluc/tool-ngork-selfhost.zip`
extracted).

1. Diff file lists of `src/` on both sides. Expect: identical, except
   the upgraded copy may additionally keep nothing extra. Report any
   missing or extra file.
2. Diff these files (ignore the intended changes listed in section 3):
   `src/App.tsx`, `src/index.css`, `src/main.tsx`, `src/types.ts`,
   `src/constants/*`, `src/prompts/*`, `src/utils/*`,
   `src/components/*`, `server.ts`, `localExec.ts`, `localSearch.ts`,
   `permissions.ts`, `index.html`, `searxng/*`, `docs/fanluc_ui.md`,
   `docs/guide-connect.md`. Expect: only intended diffs.
3. Run `npx tsc --noEmit` and report errors grouped by file
   (do NOT fix them, just report).

## 3. Intended differences (do NOT report these as bugs)

- `package.json`: name `fanluc`, version `2.4.0`, plus `bin`/`files`/
  `keywords`/`author`/`license`/`engines` metadata, `ink`/`ink-text-input`/
  `string-width` deps, `build:cli`/`build:tui`/`build:all` scripts.
- `index.html`: title `FANLUC`, English meta description.
- `server.ts`: image-search message in English.
- `src/config/hiddenTab.ts`: `{ dev_mode: true, mem: true, agent: true }`.
- `src/components/WeatherCard.tsx`: time/date in black.
- `src/components/WeatherBackgrounds.tsx`: black-and-white illustrations.
- `src/components/ChartDisplayCard.tsx`: all-white series with dash
  patterns (`SERIES_DASH`), `pickSeriesColor` gate, black card chrome.
- `src/components/PieChartDisplayCard.tsx`: all-white slices with black
  separators, `pickPieColor` gate, black card chrome.
- `src/components/TranslationCard.tsx`: black surfaces, white text.
- `src/components/TurtleCard.tsx`: pen colors gated to black/white.
- `src/utils/exportWeatherCard.ts`: exported template also black/white.
- `src/utils/defaultSkills.ts`: skill examples use black/white only.
- `src/utils/codeRunner.ts`: comment example uses `#000`.
- `src/components/CardsShowcase.tsx`: demo payloads use black/white.
- Gray/neutral Tailwind utilities remapped (`bg-*` by shade, `text-*`
  by light/dark mode, `border-*` to black/15 / white/15).
- `src/index.css`: autofill fix uses `#ffffff`.
- `README.md` / `SEARXNG_README.md`: rewritten in English.
- `version.md`: `2.4.0` with English changelog.
- New dirs: `src/cli` (config + launcher), `src/core` (fetch shim,
  system-prompt builder, agent loop), `src/tui` (Ink terminal UI),
  `bin/` (`fanluc` wrapper). The TUI reuses the web tool protocol over
  the local server API; file writes ask inline in ask mode, shell
  approvals come from `/api/permissions/pending` + `decide`, readOnly
  blocks writes/shell client-side. All TUI strings English, monochrome.
- New file: `TEST-PROMPT-FOR-OPENCODE.md` (this file).
