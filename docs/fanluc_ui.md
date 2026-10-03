# FANLUC Interface — Detailed UI Description

> Read this to know exactly what the human user SEES on screen while chatting with you, and what happens on screen when YOU run a command. You cannot see the UI yourself, so rely on the exact labels below when guiding the user.

## 0. TL;DR
- FANLUC is a retro, terminal-like chat web app. Black & white, sharp rectangular borders, ALL-CAPS bracketed labels like `[SEND]`, `[SETTINGS]`.
- Text is drawn in mono fonts, each character randomly picked from Courier Prime / VT323 / Share Tech Mono / Inconsolata (so text looks "glitchy-mixed"). Serif Lora is only used if the user enables it in Settings.
- Light mode = white background, black text. Dark mode = inverted. Toggle button: `[DK]` (switches to dark) / `[LT]` (switches to light).
- The user NEVER sees raw command syntax (`search(...)`, `fetch(...)`, `run_cmd{...}` ...). They only see a status line, a collapsible `TOOL LOGS` box, and result cards. Tool results come back to YOU as a hidden next message.
- Exceptions to the "sharp black/white" style: Weather card (rounded, colored illustration), Translation / Chart / Pie cards (dark zinc, rounded).

## 1. Screen layout (default)
```
+--------------------------------------------------------------+
| [HISTORY]  FANLUC        [FILES] [SETUP_GUIDE] [SETTINGS] [DK]|  <- header, 2px bottom border, sticky
+--------------------------------------------------------------+
|                                                              |
|                       Hi!  (big serif greeting)              |  <- empty chat only
|                                                              |
+==============================================================+  <- 2px top border of input area
| +----------------------------------------------------------+ |
| | Type your message...                                     | |  <- textarea, 2px border
| +----------------------------------------------------------+ |
| + [ATTACH_FILE] (All files <= 2MB | Image <= 15MB)  [CLEAR][SEND] |
+--------------------------------------------------------------+
```
- Content is centered, max width ~ 6xl. Header is sticky at top, input area sticky at bottom.
- Optional black bar `[PERF_TELEMETRY]` (dev HUD) can appear right under the header.

## 2. Header
- Left: `[HISTORY]` (becomes `[HIDE_HIST]` while sidebar is open) toggles the chat-session sidebar. Next to it the logo text **FANLUC** (uppercase, bold, letter-spaced).
- Right (desktop): `[FILES]` or `[FILES (n)]` (opens the WORKSPACE FILES panel, n = files count), `[SETUP_GUIDE]`, `[SETTINGS]`, `[DK]`/`[LT]`.
- Mobile: header wraps into two rows; the theme button sits on the top row, the other buttons share the second row equally.
- All buttons: 1px border, uppercase bold, hover = colors invert.

## 3. Empty state
Big centered greeting in Lora serif (3xl-6xl), no messages. Chosen randomly per chat: `Hi!`, `Sup Ya?`, plus time-based (`Morning!` 5-12h, `Afternoon!` 12-18h, `Evening!` 18-23h, `Is something up tonight?` 23-5h) and seasonal (Halloween question, `Merry Christmas!`, `Happy New Year!`, `Are you going anywhere this summer?` in Jun-Aug).
Special case: if the user's first message is just "hi" or "hello", the app answers locally ("Hi! How can I help you today?") without calling you.

## 4. Input area
- Textarea, placeholder is one of "Type your message...", "Type a message...", "Write your message...", "Write a message...". Auto-grows up to 140px. Enter = send, Shift+Enter = new line. Disabled while you are answering.
- `+ [ATTACH_FILE]`: one file at a time. Any file <= 2MB, images <= 15MB (hint text hidden on small screens). Text files are read as text, binary files as base64, images shown to you as vision input. Errors appear in a dashed box: `[SIZE_LIMIT_EXCEEDED] ...` with `[CLEAR]`.
- After attaching: preview row with 40px thumbnail (or `[TXT]` tile), file name, `TYPE | size (Limit: ...)`, and `[REMOVE_FILE]`.
- `[CLEAR]` appears when there is text/attachment. `[SEND]` is a filled black button (white in dark mode), 40% opacity when there is nothing to send. While you are generating it turns into `[STOP]`.
- `[↓ BOTTOM]` floating button appears above the input when the user scrolled up.

## 5. Messages
- **User bubble:** inverted colors (black bg / white text), pushed right. Header row: `[USER]`, time HH:MM:SS, `[EDIT]` (edit + `[RESEND]`/`[CANCEL]`), `[COPY]`. Attachments show `[ATTACHED_FILE: name]` with image preview or first 500 chars of text + `[CONTINUED]`. Messages > 6 lines are folded: `[SHOW +N LINES]` / `[HIDE]`.
- **Assistant bubble:** outlined (white bg / black border), pushed left. Header row: `[MODEL NAME]` (from Settings), time, `[BRANCH]` (fork chat from here), `[COPY]`.
- Inside an assistant bubble, top to bottom:
  1. Thinking block (if the model uses think tags): `Thinking...` while streaming, then collapsed `Thought for Ns`; expands into `Step 1 · 3s`, `Step 2 ...`.
  2. Text segments (Markdown: uppercase h1/h2/h3, tables with borders, blockquote with left bar, code blocks) interleaved with `TOOL LOGS` boxes, in the order you did things.
  3. Cards (map, step guide, tab, chart, pie, translation, weather, images).
  4. `[CREATED_OR_MODIFIED_FILES (n)]` file cards.
  5. `[SOURCES: n]` button (URLs you fetched).
  6. While streaming: a small spinning MSH logo GIF (black version in light mode, inverted in dark mode).
- Code blocks: black box with `[LANG]` label and `[COPY]`; > 10 lines are collapsed with `[SHOW: N LINES]`/`[HIDE]`.
- API error: dashed-border inverted box `[API_CONNECTION_ERROR]` + details + `[RETRY]` and `[VIEW_SETUP_GUIDE]`.

## 6. What the user sees when YOU run a command
While a command runs, a plain status line appears under the last message (no spinner icon). After the turn, a collapsed `TOOL LOGS` box (click to expand) lists one row per command with an icon. Consecutive commands without text between them are merged in one box.

| Your command | Status line / TOOL LOGS row | What the user sees as result | What you receive back |
|---|---|---|---|
| `search("q")(n)` | `Searching the web: "q"...` | Nothing but the log row | `N results:` then lines `url: snippet` |
| `fetch(url)(len)` | `Fetching URL ...` | `[SOURCES: n]` button under the message (favicons; expands to domain + link + `[COPY]`) | `fetched url: ...`, `title: ...`, `text: ...` (cut to `len`, max 10000) |
| `image_search(query, count)` | `Searching images: "q"...` | Card `[IMAGE_SEARCH] "q" — N images`: black header bar, 2-3 column square thumbnails (max 6), click opens the image | one-line summary only (no URLs) |
| `show_weather(location)` | `Fetching weather for X...` | Weather card (see 7). `auto` triggers a browser geolocation permission popup | `[WEATHER RESULT: City - 30°C, Sunny]` |
| `translate(text,to)` | `Translating text: "..."...` | Translation card (see 7) | `translated "..." (from -> to): "..."` |
| `show_map([...])` | `Rendering map: ...` | Map card (see 7) | confirmation |
| `run_cmd{...}` | `Running: <first 45 chars>` | Files it creates appear as file cards and in `[FILES]` | `$ cmd` + real stdout/stderr |
| `write_file / edit_file / read_file / delete_file / move_file / glob / grep / git_diff / git_checkout` | `Creating file x...`, `Editing file x...`, `Reading file x...`, `Deleting...`, `Moving a -> b...`, `Listing directory...`, `Searching inside files...`, `Checking git diff...`, `Reverting file...` | File cards for created/modified files | result text |
| `read_docs(name)` | `Reading doc name...` | log row only | doc content |
| `list_skills` / `load_skills(id)` | `Listing available skills...` / `Loading skill(s): id...` | log row only | skill text |
| `list_history / see_history / list_chat_keywords` | `Reading chat history (part n)...` etc. | log row only | history text |
| `mcp_call(server, tool, args)` | `Calling MCP server.tool...` | log row only | tool result |
| `ask("Q")-sam(opt1, opt2)` | — | Section `[QUICK RESPONSE REQUIRED]`: one question at a time `Q1/2: ...` with option buttons; the picked answer is sent automatically as the user's next message | the answer text |
Failures show status `[FETCH_URL_FAILED]` or `[COMMAND_ERROR]` briefly; you get an error string.

## 7. Native cards (write them directly in chat, do not repeat their content as plain text)
- **Map card** (`show_map`): full-width bordered box, gray title bar (title or "Map Card", `1/N` counter), 360-400px tall. With > 1 place: left list "Places (N)" with numbered squares, right embedded Google Map; click a place to switch.
- **Step guide** (`|Step-by-step guide|` block, 3-20 steps): one step at a time, centered text, footer `<   1/5   >`.
- **Tab card** (`|Tab display card|`, 2-8 tabs): tab strip on top, content below (supports `(checkbox)` items), footer `TAB 1/3` plus mode buttons: `[COPY]`, or `[PREV]`/`[NEXT]`/`[DONE]`→`[COMPLETED]` (need_complete), or `<` `>` (none).
- **Chart card** (`chart`, line/bar/scatter): dark zinc rounded card, title, top-right toggle pill (chart icon / table icon), SVG chart with hover tooltip and legend.
- **Pie card** (`pie_chart`): same dark style, donut/pie, legend with percentages, table toggle (Category / Value / Share %).
- **Translation card**: dark rounded card, optional title, two columns `FROM` code | `TO` code (e.g. `EN` | `VI`), each with speaker (text-to-speech) and copy icons; stacked vertically on mobile.
- **Weather card**: 300px wide white rounded card. Top 148px = animated colored illustration by condition (sunny, cloudy, windy, fog, snow, rain/storm) with big temperature `32°`, condition and location in white text; bottom strip shows time (left) and date (right).
- **Image search card**: see table above.
- **File card**: bordered row with icon (globe=HTML, file=doc, image=SVG, code), file name, category like `Code · HTML`, `DOWNLOAD` button; `DOWNLOAD ALL` when several. Click opens the file in the right panel.
- `/mcps` shows an MCP status panel (server list with `[ON]`/`[OFF]`, `[DELETE]`, `[EDIT]`, `[RELOAD]`, `[+ ADD SERVER]`, SearXNG URL field with `[SAVE]`).

## 8. Files & artifact panel
- Long code/documents should be saved with `run_cmd` (heredoc); the user then opens them through the file card or the `[FILES]` button.
- Clicking a file card splits the screen: chat on the left (half width, input moves into this column), file viewer on the right. On mobile the viewer replaces the chat.
- Viewer toolbar: `PREVIEW` / `CODE` tabs (preview for HTML in a sandboxed iframe, Markdown, SVG, Mermaid, PDF; other types show code only), reload (HTML), `COPY`, download icon, expand/restore (desktop), close (X).
- `[FILES]` panel `WORKSPACE FILES (n)`: `+ UPLOAD` (max 2MB), `DOWNLOAD ALL`, close; list of file rows with delete; empty text `NO FILES AVAILABLE`.

## 9. Sidebar, modals, extras
- **Sidebar** (`[HISTORY]`): drawer from the left (288-320px) over a dimmed backdrop. Title `[CHAT_SESSIONS]` + `[CLOSE]`; `+ [NEW_CHAT] [n/16]` (max 16 chats); `[EXPORT_TXT]`, `[CLEAR_ALL]`; session rows (selected = inverted; double-click or `[EDIT]` to rename; `[X]` delete, asks confirmation); footer `[VOICE_CHAT_BETA]`.
- **Confirm modal**: centered box, 2px border, title, message, `[CANCEL]` and filled `[CONFIRM]`.
- **[SETTINGS]** modal, left tab list: `[API_CONFIG]` (API URL with presets OPENAI / GEMINI / OPENROUTER / GROQ / OLLAMA, API key, model name, system prompt, temperature, top P, top K, repeat penalty, reasoning effort, max tokens, Lora serif switch, think/strip tags), `[CHAT_TEMPLATE]`, `[EFFORT]` (Fast / Cautious / Thorough / Meticulous), `[SKILLS]` (create/edit/`[ON]`/`[OFF]`), `[MEM]` (master `[ON]`/`[OFF]`, your own keyword-tagged memories, the AI's own write_mem memories, and "generate memory from chat history"), `[AGENT]` (master `[ON]`/`[OFF]`, create/edit sub-agents with their own API config + effort + tag text/image, test-prompt button, export/clear each agent's own workspace), `[MCP]`, `[DEV_MODE]`. Bottom `[SAVE_SETTINGS]`. OLLAMA fills `http://localhost:11434/v1/chat/completions`; the API key field can stay blank, and the model name should be a locally-pulled Ollama model (e.g. `llama3.1`).
- **[DEV_MODE]**: toggles `[HUD: ON/OFF]`, `[RAW: ON/OFF]` (shows raw payloads), `[ROLE_SIM: ON/OFF]`, `[CARDS: ON/OFF]` (gallery of all cards), plus a `/help` tool manual.
- **[SETUP_GUIDE]** modal: "PREREQUISITES & SETUP GUIDE", 4 steps: ngrok authtoken → Google Colab T4 GPU → run server code (llama-cpp-python + ngrok) → paste API Base URL (`https://xxxx.ngrok-free.dev/v1`) and API key into Settings.
- **Voice chat** (`[VOICE_CHAT_BETA]`): fullscreen. Left: `YOU` box (live transcript), `AI` box (`Thinking...`/`Speaking...`), language toggles (multi-select, then `[ACTIVE] <lang>`). Right: `[AUDIO_LEVEL]` 7 vertical bars and `[STATUS: ...]`. Exit `[X]` top-right. Needs microphone permission.
- **Slash commands typed by the user**: `/help` (tool manual), `/mcps`, `/compact [hint]` (summarizes the conversation; status `[COMPACTING_CONTEXT: N messages]`).
- **`[PERF_TELEMETRY]` bar** (black): TOKENS, SPEED tok/s, TOOLCALLS, SYS_PROMPT, `[DEV_CONSOLE]`, close.

## 10. Tips for you (the AI)
- Refer to buttons by their exact bracket labels, e.g. "open [SETTINGS] → [API_CONFIG]".
- Never tell the user to type commands; just run them. Don't print command syntax.
- Cards already show their data: after a card, add only 1-2 sentences of insight.
- For long code/documents use `run_cmd` and tell the user to press `[FILES]` or the file card.
- If the API connection fails, point to `[SETUP_GUIDE]`.
- The user's screen may be a phone: keep replies compact.

## 11. Docs access
- `read_docs(fanluc)`, `read_docs(mondk)`, `read_docs(msh)`.
- Any `search(...)` containing "fanluc" lists `https://fanluc.docs/` as the FIRST result. `fetch("https://fanluc.docs/")` returns the docs index + this file; `/mondk`, `/msh`, `/guide` return the other docs.
- Any `search(...)` containing the word "mondk" or "msh" lists `https://mondk-msh.docs/` as the FIRST result. `fetch("https://mondk-msh.docs/")` returns docs/mondk.md and docs/msh.md; `/mondk` and `/msh` return one each.

---

mondk is the creator of this website(fanluc).
His page: https://huggingface.co/mondk
He started working on August 5, 2026.
He worked at hugging because Claude(a strong AI at that time) was very expensive, he just chatted... 2 times and it ran out of turns(qouta)
His logo consists of the letters M, S, and H layered over one another.
Since mondk is not proficient in English, his repository descriptions are very brief or written using Google Translate; the name "mondk" itself is derived from "moon" and "dark."
