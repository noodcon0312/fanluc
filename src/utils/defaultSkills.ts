import { Skill } from "../types";

export const DEFAULT_SKILLS: Skill[] = [
  {
    id: "skill-map-card",
    title: "Map Card (show_map)",
    describe: "Render map cards for locations",
    tags: ["map", "location", "places", "coordinates"],
    isDefault: true,
    enabled: true,
    content: `# Skill: Map Card (show_map)

YOU MUST WRITE INTO CHAT as plain text. Do NOT use run_cmd, do NOT create any file or script for this card.


## When to use this skill
Load and use this skill when the user asks about specific locations, places of interest, directions, travel itineraries, or venue recommendations where viewing places on an interactive map card is helpful.

Do not use when the question is not related to geographical places or only requires brief text without visual spatial context.

## Command syntax
Emit the following syntax to display an embedded Google Maps card:

\`\`\`
show_map([{"name": "Place Name 1"}, {"name": "Place Name 2"}], title="Optional Title")
\`\`\`

Rules:
- Each item in the array is an object with a "name" string property: \`{"name": "Place Name"}\`.
- Provide clear, identifiable place names (include city or country context if ambiguous, e.g. "St. Joseph Cathedral, Hanoi").
- Maximum 8 places per command for a clear, readable list.
- No coordinates or geocoding are required. Google Maps automatically locates the place directly from the text query.
- When multiple places are provided, users can switch between them by clicking on the list next to the interactive map.

## Post-command response
After the command completes, provide a brief description (1-2 sentences) of the highlighted spots. Do not re-list all place names as plain text since the map card displays them interactively.

## Benefits
- Fully client-side interactive map with zero API keys or backend geocoding needed.
- Provides direct links for navigation and viewing in Google Maps.`,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
  {
    id: "skill-step-guide",
    title: "Step-by-step guide (|Step-by-step guide|)",
    describe: "Render an interactive step-by-step walkthrough card for concise, sequential instructions (3-20 steps)",
    tags: ["guide", "tutorial", "steps", "step-by-step", "walkthrough", "instruction", "howto"],
    isDefault: true,
    enabled: true,
    content: `# Skill: Step-by-step guide (|Step-by-step guide|)

YOU MUST WRITE INTO CHAT, CREATION OF FILE.md is PROHIBITED

## When to use this skill
Load and use this skill when:
- The user prefers concise, interactive step-by-step instructions rather than reading a long wall of text.
- The user explicitly asks for a step-by-step guide, tutorial, walkthrough, or how-to breakdown.
- Breaking down a multi-step task or game/software control into discrete, digestible steps improves user clarity.

Do not use when:
- The answer only requires a quick 1-2 sentence response.
- The request is purely conversational or theoretical with no sequential action steps.

## Command syntax
Emit the following block syntax to display an interactive step-by-step guide card:

---
|Step-by-step guide|
1: <Step 1 description>
2: <Step 2 description>
3: <Step 3 description>
---

## Rules
- Delimit the entire block with triple dashes (\`---\`) before and after.
- Header must be exactly \`|Step-by-step guide|\`.
- Number each step sequentially: \`1:\`, \`2:\`, \`3:\`, etc.
- Step count requirement: Minimum 3 steps, maximum 20 steps.
- Each content has a maximum of 400 characters
- Each step should be concise, punchy, and actionable.
- You may use markdown formatting within step lines (e.g. \`***Key***\`, \`**Bold**\`, \`*Italic*\`, \`\`code\`\`, \`![description](image or youtube url)\`).

## Example
---
|Step-by-step guide|
1: Create your first box using Right Click -> New Box.
2: Hold ***Q*** and drag to connect boxes together.
3: Hold ***S*** and move mouse to scale and rotate any box.
---

## Post-command response
After the step-by-step guide block, you may provide a very brief 1-sentence tip or concluding sentence if needed. Do not duplicate the steps in plain text outside the card.`,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
  {
    id: "skill-tab-card",
    title: "Tab display card (|Tab display card|)",
    describe: "Render interactive multi-tab display cards with optional copy or completion modes (2-8 tabs)",
    tags: ["tab", "tabs", "tab_card", "checklist", "itinerary", "quiz", "compact"],
    isDefault: true,
    enabled: true,
    content: `# Skill: Tab display card (|Tab display card|)

YOU MUST WRITE INTO CHAT, CREATION OF FILE.md is PROHIBITED

## When to use this skill
Load and use this skill when:
- The user requests tabbed presentation or compact categorization of multi-part items (e.g. multi-day itineraries, categorized summaries, step-by-step checklists, or mini interactive quizzes).
- Presenting 2 to 8 distinct sections where tab-switching improves readability.

Do not use when:
- The content exceeds 8 sections or has extensive text (create a file instead of using this card).
- The answer is very short (1-2 sentences).

## Command syntax
Emit the following block syntax:

---
|Tab display card|
- <tab 1 name>: <content>
- <tab 2 name>: (checkbox) <checkbox option or content>
[copy]
---

## Modes
Specify one mode inside brackets at the end of the block:
- \`[none]\`: Standard tab switching interface.
- \`[copy]\`: Adds a button to copy the active tab's text content to clipboard (default).
- \`[need_complete]\`: Adds Next/Done progress controls for checklist or quiz completion.

## Checkbox support
Add \`(checkbox)\` before any line or content item to render it as an interactive checkable item.

## Rules
- Delimit the block with triple dashes (\`---\`) before and after.
- Header must be exactly \`|Tab display card|\`.
- Tab title: Maximum 20 characters per tab name.
- Tab content: Maximum 800 characters per tab.
- Tab count requirement: Minimum 2 tabs, maximum 8 tabs.
- Supports markdown formatting and media embeds (\`![description](image or youtube url)\`) inside tab content.
- Do not repeat tab contents in plain text outside the card. Provide only 1-2 introductory or concluding sentences.

## Example 1 (Itinerary):
---
|Tab display card|
- Day 1:
8:00 AM Sensō-ji Temple
9:30 AM Nakamise Street
- Day 2:
9:00 AM Shibuya Crossing
World's busiest pedestrian crossing
[copy]
---

## Example 2 (Interactive Checklist):
---
|Tab display card|
- Part 1:
(checkbox) Initialize project repository
(checkbox) Install essential dependencies
- Part 2:
(checkbox) Configure environment variables
(checkbox) Run initial build verification
[need_complete]
---`,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
  {
    id: "skill-chart-display-v0",
    title: "Chart Display (chart_display_v0)",
    describe: "Displays a simple chart (line, bar, or scatter) inline in chat, rendered natively by the app",
    tags: ["chart", "plot", "graph", "line", "bar", "scatter", "visualize", "data"],
    isDefault: true,
    enabled: true,
    content: `# chart_display_v0

## Description
Displays a simple chart (line, bar, or scatter) inline in chat, rendered natively by the app. Use it for quick, standard charts of a small dataset already known or computed — trends over time, category comparisons, or relationships between two numeric variables.

## When to use
- User pastes/describes numbers and asks to "plot", "chart", or "graph" them
- A short table would be clearer as a line/bar chart
- User asks how a quantity changed over time and you have the values

## When NOT to use
- A sentence or small table already answers the question
- Only a single number is involved
- Data would need to be invented/estimated
- Needs pie/donut/stacked/area charts, annotations, multiple panels, deep interactivity, custom styling, maps/diagrams, or very large datasets → use Visualizer/artifact instead
- Never draw the same chart with both tools

YOU MUST WRITE INTO CHAT, no need to run cmd. no need create a .py file.

## Format (schema)
\`\`\`yaml
{
  "name": "chart_display_v0",
  "parameters": {
    "style": "line | bar | scatter",       # required
    "series": [                             # required, max 12 series, max 2000 points/series
      {
        "name": "...",                      # optional, shows legend if set
        "color": "...",                     # optional hex color
        "values": [ ... ],                  # required for line/bar (1D data)
        "points": [ { "x": ..., "y": ... } ] # required for scatter (2D data)
      }
    ],
    "title": "...",                         # optional chart title
    "x_axis": {
      "data": [ "...", "..." ],             # optional category labels (line/bar)
      "format": "...",                      # optional number/date format string
      "min": ...,
      "max": ...,
      "scale": "linear | log",
      "title": "..."                        # optional axis unit label
    },
    "y_axis": {
      "data": [ "...", "..." ],
      "format": "...",
      "min": ...,
      "max": ...,
      "scale": "linear | log",
      "title": "..."
    }
  }
}
\`\`\`

## Notes
- Line/bar charts: use \`values\` + \`x_axis.data\` (labels must match value count, in order)
- Scatter charts: use \`points\`, not \`values\`
- Bar charts always start y-axis at 0
- Name each series if there's more than one (enables legend)
- \`color\`/\`format\` may be ignored on some mobile clients — don't rely on color alone
- After rendering, summarize the key takeaway in 1-2 sentences instead of listing every data point

## Example — Line chart
\`\`\`json
{
  "style": "line",
  "title": "Monthly Revenue 2026",
  "series": [
    { "name": "Revenue", "values": [120, 135, 150, 142] }
  ],
  "x_axis": { "data": ["Jan", "Feb", "Mar", "Apr"] },
  "y_axis": { "title": "USD (thousands)" }
}
\`\`\`

## Example — Bar chart (multi-series)
\`\`\`json
{
  "style": "bar",
  "title": "Sales by Region",
  "series": [
    { "name": "2025", "values": [30, 45, 28] },
    { "name": "2026", "values": [40, 50, 35] }
  ],
  "x_axis": { "data": ["North", "South", "West"] }
}
\`\`\`

## Example — Scatter chart
\`\`\`json
{
  "style": "scatter",
  "title": "Height vs Weight",
  "series": [
    {
      "name": "Sample",
      "points": [
        { "x": 160, "y": 55 },
        { "x": 170, "y": 65 },
        { "x": 180, "y": 75 }
      ]
    }
  ],
  "x_axis": { "title": "Height (cm)" },
  "y_axis": { "title": "Weight (kg)" }
}
\`\`\``,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
  {
    id: "skill-pie-chart-display",
    title: "Pie Chart Display (pie_chart_display_v0)",
    describe: "Displays a simple pie (or donut) chart inline in chat, rendered natively by the app for breakdown, share, proportion, percentage",
    tags: ["pie", "donut", "pie_chart", "donut_chart", "breakdown", "share", "proportion", "percentage", "market_share", "allocation", "chart"],
    isDefault: true,
    enabled: true,
    content: `# pie_chart_display_v0

YOU MUST WRITE INTO CHAT as plain text. Do NOT use run_cmd, do NOT create any file or script for this card.

## Description
Displays a simple pie (or donut) chart inline in chat, rendered natively by the app. Use it for showing how a whole breaks down into parts — proportions, shares, or percentages of a single category set.

## When to use
- User asks to see a "breakdown", "share", "proportion", or "percentage split" of a total
- Data naturally sums to 100% or to a meaningful whole (e.g. budget allocation, market share, vote share)
- A handful of categories (ideally 3–8) need to be compared by relative size

## When NOT to use
- More than ~8-10 slices (pie becomes unreadable) → use a bar chart instead
- Comparing values across time or multiple groups → use line/bar chart instead
- Only a single number/percentage is involved → a sentence is enough
- Needs multiple panels, drill-down, annotations, or custom styling → use Visualizer/artifact instead
- Data would need to be invented/estimated

## Format (schema)
\`\`\`yaml
{
  "name": "pie_chart_display_v0",
  "parameters": {
    "title": "...",                     # optional chart title
    "style": "pie | donut",             # optional, default "pie"
    "slices": [                         # required, min 2, max ~10 slices
      {
        "label": "...",                 # required, name of the slice
        "value": ...,                   # required, numeric value or percentage
        "color": "..."                  # optional hex color
      }
    ],
    "unit": "...",                      # optional, e.g. "%", "$", "users"
    "show_legend": true,                # optional, default true
    "show_percentages": true            # optional, default true — shows % labels on slices
  }
}
\`\`\`

## Notes
- \`value\` fields don't need to already sum to 100 — the tool normalizes them into proportions automatically
- Keep slice count small (3–8 ideal); too many slices makes labels overlap and hurts readability
- Order slices largest → smallest for easier scanning, unless a natural order (e.g. categories) matters more
- Don't rely on color alone — labels/legend should always be present
- After rendering, state the key takeaway (e.g. largest share, notable gap) in 1-2 sentences instead of reading out every slice

## Example — Simple pie chart
\`\`\`json
{
  "style": "pie",
  "title": "Marketing Budget Allocation",
  "unit": "$",
  "slices": [
    { "label": "Digital Ads", "value": 45000 },
    { "label": "Content", "value": 20000 },
    { "label": "Events", "value": 15000 },
    { "label": "PR", "value": 10000 },
    { "label": "Other", "value": 5000 }
  ]
}
\`\`\`

## Example — Donut chart with custom colors
\`\`\`json
{
  "style": "donut",
  "title": "Browser Market Share",
  "unit": "%",
  "show_percentages": true,
  "slices": [
    { "label": "Chrome", "value": 63, "color": "#000000" },
    { "label": "Safari", "value": 20, "color": "#ffffff" },
    { "label": "Edge", "value": 8, "color": "#ffffff" },
    { "label": "Firefox", "value": 5, "color": "#ffffff" },
    { "label": "Other", "value": 4 }
  ]
}
\`\`\``,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
  {
    id: "skill-translate",
    title: "Language Translator (translate)",
    describe: "Render interactive translation cards with text-to-speech audio and copy capabilities for short phrases or sentences",
    tags: ["translate", "translation", "language", "dictionary", "dich", "phien_dich"],
    isDefault: true,
    enabled: true,
    content: `# Skill: Language Translator (translate)

## When to use this skill
Load and use this skill when:
- The user asks how to say, write, translate, or pronounce a word, phrase, or short sentence in another language.
- The user asks for translations between English, Vietnamese, Japanese, French, Spanish, Chinese, Korean, or any other language.

Do not use when:
- The text is a very long document, essay, or full article (in that case, summarize or process normally).
- The user does not ask for translation.

YOU MUST WRITE INTO CHAT. no need create file.

## Command syntax
Emit the following syntax to translate and display an interactive side-by-side translation card:

\`\`\`
translate(text="Text to translate", to="target_lang_code", title="Optional Title")
\`\`\`

Examples:
\`\`\`
translate(text="Good morning, have a nice day!", to="vi", title="Morning Greeting")
\`\`\`
\`\`\`
translate(text="Hello, it's great to meet you", to="ja")
\`\`\`

## Rules:
- \`text\`: The source string to translate.
- \`to\`: Target language ISO code (e.g., "en", "vi", "ja", "ko", "zh", "fr", "de", "es", "ru", "th").
- \`from\`: (Optional) Source language ISO code or "auto" (default is "auto").
- \`title\`: (Optional) Context title displayed at the top of the card.
- Strictly for short sentences, questions, idioms, phrases, or vocabulary.

## Post-command response
After the translation result is returned, you may provide helpful linguistic context, pronunciation tips, formality notes, or alternate expressions (1-2 sentences). Do not duplicate or repeat the exact translated sentence as raw text since the visual Translation Card already displays both source and target clearly with audio and copy buttons.`,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
  {
    id: "skill-weather",
    title: "Weather Forecast (show_weather)",
    describe: "Display a beautiful visual weather card and fetch live weather data",
    tags: ["weather", "thoi_tiet", "forecast", "nhiet_do", "temperature"],
    isDefault: true,
    enabled: true,
    content: `# Skill: Weather Forecast (show_weather)

You MUST WRITE INTO CHAT. No need to create .html file.

## When to use this skill
Load and use this skill when:
- The user asks about the weather (e.g., "what's the weather today?", "weather in Hanoi", "what's the weather in Tokyo?").

## Command syntax
Emit the following syntax to fetch weather data and display a beautiful weather card:

\`\`\`
show_weather(location="auto")
\`\`\`

Examples:
- If user asks for their own weather: \`show_weather(location="auto")\` (This will ask for their geolocation permission via the browser).
- If user asks for a specific city: \`show_weather(location="Hanoi")\`
- If user asks for Tokyo: \`show_weather(location="Tokyo")\`

## Rules:
- \`location\`: City name in English or local language, or "auto" to use the user's current GPS location.
- DO NOT use placeholders like \`location="your city"\`.
- You MUST WRITE INTO CHAT. No need to create a file.

## Post-command response
After the weather data is fetched and the card is displayed, you will receive a [WEATHER RESULT: ...] block. You can then briefly mention the weather (e.g. "It's pretty sunny today, don't forget an umbrella just in case!") to make the conversation natural.`,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
  {
    id: "skill-image-search",
    title: "Image Search (image_search)",
    describe: "Search and display image grids via SearXNG (free, no limits) with fallback",
    tags: ["image", "image_search", "searxng", "images", "photo", "picture"],
    isDefault: true,
    enabled: true,
    content: `# Skill: Image Search (image_search)

YOU MUST WRITE INTO CHAT as plain text. Do NOT use run_cmd, do NOT create any file or script for this card.


## When to use this skill
Load and use this skill when the user asks to find, show, or compare images, photos, or visual references where a grid of image results is helpful. Use for "show images of X", "find pictures of Y", product photos, moodboards, etc.

Do NOT use when the user only wants text facts or links — use the normal search/fetch instead.

## Command syntax
Emit the following syntax to search and display an image grid:

\`\`\`
image_search(query="cats in space", count=6)
\`\`\`

Rules:
- \`query\`: search keywords (short keywords work best, e.g. "Hanoi street food", "cat meme", "modern kitchen").
- \`count\`: optional, number of images to show (1-12, default 6). Max 6 shown in grid per spec.
- Maximum 6 images per command are rendered as a responsive grid (like MapEmbedCard). Click thumb → opens full img_src, hotlink failures use thumbnail_src and proxy via /api/image-proxy.
- Server maps SearXNG categories=images fields: title, img_src (full), thumbnail_src (thumb), url (page). Verify field names with console.log one result if unsure.

## Post-command response
After the command, the UI renders the grid and the model only receives a one-line summary like "Displayed 4 images for X" to save context (do NOT ask model to read image URLs). Provide a brief 1-2 sentence caption afterwards. Do not re-list URLs as plain text.

## SearXNG notes
- SearXNG is self-hosted default; Yahoo JP is fallback for text search. For images, categories=images.
- SearXNG needs settings.yml: search.formats: [html, json] (else 403), server.limiter: false, image_proxy: true, secret_key: "change-this".
- Test: curl "http://localhost:8080/search?q=test&format=json" and curl "...&categories=images&format=json".
- Safe search filter enabled on server side.

## Example
\`\`\`
image_search(query="Vietnam lantern festival", count=6)
\`\`\`
→ UI shows 6 lantern images, model gets: "Displayed 6 images for Vietnam lantern festival"
`,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
  {
    id: "skill-mcp",
    title: "MCP Servers (mcp.json)",
    describe: "Manage Model Context Protocol servers via mcp.json (stdio/http), view status, call tools",
    tags: ["mcp", "model context protocol", "tool", "server", "stdio", "http"],
    isDefault: true,
    enabled: true,
    content: `# Skill: MCP Servers (mcp.json)

## Overview
MCP (Model Context Protocol) lets you add external tools to the model. This app bridges MCP via server.ts — the web UI cannot spawn processes directly, so server.ts acts as bridge using @modelcontextprotocol/sdk Client + StdioClientTransport / StreamableHTTPClientTransport.

## Config file (server only, never from client)
Create/edit \`mcp.json\` at project root (Claude Code style):

\`\`\`json
{ "mcpServers": {
  "fetch": { "type": "stdio", "command": "npx", "args": ["-y","@modelcontextprotocol/server-everything"], "enabled": true },
  "docs":  { "type": "http", "url": "https://.../mcp", "headers": {"Authorization":"Bearer \${TOKEN}"}, "enabled": false }
}}
\`\`\`

- \`type\`: "stdio" or "local" for local processes (uses command/args/env), "http" or "remote" for remote URLs (uses url/headers).
- \`command\`: array or string (e.g. ["npx","-y","@example/mcp"]) for stdio; \`url\` + \`headers\` for http.
- \`enabled\`: false to disable without deleting. Also supports \`disabled: true\`.
- \`env\` / \`environment\`: env vars for stdio process. Use \${TOKEN} etc. — values are substituted from .env on server (read from process.env).

## Security
Only read config from file on server. Never allow client to send command/url — that would allow arbitrary code execution on your machine.

## Server endpoints (implemented in server.ts)
- GET /api/mcp/status → [{name, type, status, toolCount, tools, error}] + modelTools (prefixed server_tool)
- POST /api/mcp/call → {server, tool, args} → calls client.callTool({name: tool, arguments: args})
- POST /api/mcp/reconnect, /api/mcp/toggle (enable/disable), /api/mcp/add (form: name, type, command/url)

## Client UI
- In [SETTINGS] → [MCP] tab: each line shows name · type (stdio/http) · status (connected/failed/disabled) · tool count. Buttons: Enable/Disable, Reconnect, View tools, Add server (form name, type, command/url). If failed, show log error.
- In chat: user can type \`/mcps\` (or \`/mcp\`) to show status list like Claude Code /mcp (status + tools) and opencode mcp list (connected/disabled + config location). Equivalent to opencode's mcp list with enable/disable/toggle/auth.
- Also accessible via CommandLog tool logs.

## How model uses MCP tools
- Server does client.listTools() after connect, truncates description to 300 chars to save context.
- For model: tools are exposed as \`server_tool\` (e.g. fetch_fetch) with original inputSchema, like opencode does. Only tools of enabled/connected servers are injected.
- Model calls via \`mcp_call(server="fetch", tool="fetch", args={...})\` → server forwards to client.callTool.
- Keep tool descriptions short; MCP tools add to context and can overflow.

## OAuth
Remote http servers may need OAuth. This app supports Bearer token via headers (from .env). For full OAuth flow, see opencode docs — trigger via /mcps → auth.

## Example flow
1. Add to mcp.json: fetch stdio server (npx @modelcontextprotocol/server-everything)
2. Restart or call POST /api/mcp/reconnect
3. Check GET /api/mcp/status → status "connected", tools [{name:"fetch", description:"..."}]
4. Model sees tool "fetch_fetch" and can call mcp_call(server="fetch", tool="fetch", args={url:"https://example.com"})
`,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
  {
    id: "skill-install-pack-v1",
    title: "Install Libraries & Tools (pip / npm / winget / brew / apt)",
    describe: "Verify/install the essential toolchain for real (tesseract-ocr + Vietnamese/English language data, poppler-utils, imagemagick, pandoc, git, zip, unzip, numpy, pandas, openpyxl, python-docx, beautifulsoup4, lxml, matplotlib) and install/update any other Python library on demand with `pip install`. Includes usage examples for every tool.",
    tags: ["install", "packages", "libraries", "dependencies", "setup", "ocr", "tesseract", "pdf", "python", "pip", "update", "tools", "install_pack_v1"],
    isDefault: true,
    enabled: true,
    content: `# Skill: Install Libraries & Tools

## Overview
Commands run directly on the user's own computer (no sandbox), so you install things yourself with the machine's normal tools. Check the <environment> block first for the OS and shell. Never claim a tool is installed unless a command's real output shows it (e.g. a version number).

## 1) Check what is already there
\`\`\`
run_cmd{ python3 --version; pip --version; node --version; git --version; tesseract --version; pdftotext -v; magick -version; pandoc --version }
\`\`\`
(On Windows PowerShell use \`python --version\`, and \`Get-Command <tool>\` to see whether a tool exists.) Anything that says "not found" is missing.

## 2) Install missing things (non-interactive, always with -y / --yes)
- Python libraries: \`run_cmd{ pip install -U pandas openpyxl python-docx beautifulsoup4 lxml matplotlib pytesseract }\` (use \`python -m pip\` if \`pip\` is not found).
- Node packages: \`run_cmd{ npm install <pkg> }\` inside the project folder.
- System tools: Windows \`winget install -e --id <Id> --silent\`; macOS \`brew install <pkg>\`; Debian/Ubuntu \`sudo -n apt-get install -y <pkg>\` (sudo cannot ask for a password here: if it fails, tell the user the exact command to run themselves).
- Usual package names: tesseract (OCR, plus the language data for Vietnamese: \`vie\`), poppler (pdftotext/pdftoppm), imagemagick, pandoc, git.
Long installs: use \`run_cmd_bg\` and read its log. Report to the user exactly what was installed and what failed.

## What each tool is for and how to use it

### System CLI tools
- **tesseract-ocr** - OCR: text from images. Check installed languages with \`tesseract --list-langs\`. ALWAYS pass \`-l\` for non-English text. Quote filenames with spaces.
  \`run_cmd{ tesseract "document_scan.jpg" output -l eng }\` then \`run_cmd{ cat output.txt }\`
  Poor quality? preprocess first: \`magick in.jpg -colorspace Gray -resize 200% -sharpen 0x1 clean.png\`. Check languages: \`tesseract --list-langs\`.
- **poppler-utils** - PDF tools. Text: \`pdftotext -layout in.pdf out.txt\`. Images: \`pdfimages -png in.pdf img\`. Page to PNG (for OCR of scanned PDFs): \`pdftoppm -r 200 -png in.pdf page\`. Info: \`pdfinfo in.pdf\`.
- **imagemagick** - image conversion/crop/resize. ImageMagick 7: \`magick\`, ImageMagick 6: \`convert\` (use whichever exists). Examples: \`magick in.jpg -resize 50% out.jpg\`, \`magick in.png -crop 400x300+10+20 out.png\`, \`identify in.jpg\`.
- **pandoc** - convert documents: \`pandoc in.md -o out.docx\`, \`pandoc in.docx -t markdown -o out.md\`, \`pandoc in.html -o out.md\`. (PDF output needs LaTeX, which is not installed - go through docx/html instead.)
- **git** - inspect and revert: \`git init\`, \`git add -A && git commit -m "msg"\`, \`git diff\`, \`git log --oneline\`, \`git checkout -- file\`.

### Python libraries (already importable by \`python3\`)
- **numpy** - fast arrays and math: \`python3 -c "import numpy as np; print(np.mean([1,2,3]))"\`.
- **pandas** - tables: \`df = pd.read_csv("a.csv"); print(df.describe()); df.to_excel("out.xlsx", index=False)\`.
- **openpyxl** - Excel .xlsx files (pandas uses it): \`wb = openpyxl.load_workbook("a.xlsx"); ws = wb.active; ws["A1"] = "x"; wb.save("a.xlsx")\`. Use it directly for formulas, styles, multiple sheets.
- **python-docx** (import name \`docx\`) - Word .docx: \`from docx import Document; d = Document(); d.add_heading("Title", 1); d.add_paragraph("text"); d.save("out.docx")\`. Read: \`[p.text for p in Document("in.docx").paragraphs]\`.
- **beautifulsoup4** (import \`bs4\`) - parse HTML/XML: \`from bs4 import BeautifulSoup; soup = BeautifulSoup(html, "lxml"); [a["href"] for a in soup.select("a[href]")]\`.
- **lxml** - fast parser used by BeautifulSoup, also XPath: \`from lxml import etree; etree.parse("a.xml").xpath("//item/text()")\`.
- **matplotlib** - charts saved to files (headless, no plt.show()): \`import matplotlib.pyplot as plt; plt.plot([1,2,3]); plt.savefig("chart.png", dpi=150)\`. For non-ASCII labels, keep text short or use DejaVu Sans.

## When to use this skill
- "command not found" for tesseract / pdftotext / magick / pandoc / git, or "ModuleNotFoundError" for any library.
- OCR of images or scanned PDFs (especially Vietnamese), PDF text extraction, Word/Excel generation, HTML scraping, charts.
`,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },

  {
    id: "skill-locked-docs",
    title: "System Docs (FANLUC, MSH, MONDK)",
    describe: "Dedicated docs about author mondk, the msh project, and the fanluc interface. ONLY use when the user explicitly asks about mondk, msh, or fanluc.",
    tags: ["fanluc", "mondk", "msh"],
    isDefault: true,
    isLocked: true,
    enabled: true,
    content: `This includes documentation for the current interface, as well as for msh, mondk, and fanluc. These materials are designed to help you assist users.

Use the following commands:
read_docs(fanluc)
read_docs(mondk)
read_docs(msh)

This will return information regarding msh, mondk, or fanluc.`,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
  {
    id: "skill-turtle-card",
    title: "Turtle Card (turtle_card)",
    describe: "Draw shapes step by step with a small LOGO/turtle-graphics language, rendered as an animated drawing with preview/code tabs, a play/stop control, and a log",
    tags: ["turtle", "draw", "drawing", "shape", "graphics", "logo", "geometry", "animation"],
    isDefault: true,
    enabled: true,
    content: `# Skill: Turtle Card (turtle_card)

YOU MUST WRITE INTO CHAT as plain text. Do NOT use run_cmd, do NOT create any file or script for this card.


## When to use this skill
Use when the user asks you to draw a shape, pattern, path, or simple picture (square, star, spiral, staircase, house outline, flower made of circles, etc.), or wants to see how a turtle-graphics / LOGO-style program moves and draws. This is for LINE-BASED geometric drawing, not photos or free-form illustration.

## Command syntax
Emit exactly one call like this, with the drawing program as raw lines of code inside the braces (not JSON, not quoted as a string):

\`\`\`
turtle_card{
repeat 4 {
  forward 100
  right 90
}
print "square drawn"
}
\`\`\`

The card shows a "preview" tab (canvas + a Play/Stop button + a Log panel) and a "code" tab (the raw program you wrote). A finite program draws itself immediately and Play just replays the same animation; a program that ends in an infinite loop starts playing automatically and Stop pauses it -- that is what the Play/Stop button is for.

## Language reference (ONE command per line)
- \`forward N\` / \`fd N\` -- move N units in the current heading, drawing a line if the pen is down. \`back N\` / \`bk N\` moves backward.
- \`right N\` / \`rt N\` -- turn N degrees clockwise. \`left N\` / \`lt N\` turns counter-clockwise. Heading 0 faces up.
- \`penup\` / \`pu\` -- lift the pen (move without drawing). \`pendown\` / \`pd\` -- lower it again (this is the default at the start).
- \`color NAME\` -- only \`black\` or \`white\`, e.g. \`color black\`, \`color white\`. Any other color is drawn in black. \`pensize N\` -- line thickness.
- \`goto X Y\` -- jump to an absolute coordinate (draws a line there if the pen is down). \`home\` -- return to the center, heading up. \`clear\` -- erase the canvas so far (position/heading are unchanged).
- \`speed N\` -- animation speed, 1 (slow) to 10 (fast). Only needed if you want the Play animation faster/slower than the default.
- \`print "text"\` -- writes a line to the Log panel (use this for labels, step commentary, or a final "done" message; do not use it to narrate every single move).
- \`repeat N {\` ... \`}\` -- repeats the block N times (a normal integer). Braces go on their own line, matching the example above. Nesting is supported.
- \`repeat forever {\` ... \`}\` or \`loop {\` ... \`}\` -- an INFINITE loop that keeps animating until the user presses Stop. Only put this as the LAST thing in the program (anything you want drawn once should come before it, not after).

## Rules
- One command per line, exactly as shown above -- no other syntax (no semicolons, no commas between arguments, no JavaScript).
- Only use \`repeat forever\`/\`loop\` when the user actually wants a continuous/looping animation (e.g. "spin forever", "keep drawing"); for a normal finite shape (a square, a star, a house) just use bounded \`repeat N\` or plain commands, so it draws once and stops.
- Keep the program reasonably sized (a few dozen lines, or a repeat count in the hundreds at most) -- this draws in the browser, not a real interpreter.
- After the command, give a short (1-2 sentence) description of what was drawn. Do not also describe it as a wall of text with coordinates; the card shows the drawing.`,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
  {
    id: "skill-write-mem",
    title: "Memory (write_mem)",
    describe: "How and when to save a durable memory about the user or an ongoing project with write_mem, so it can be recalled with read_mem in a later conversation -- and, just as importantly, when NOT to save one",
    tags: ["mem", "memory", "remember", "recall", "save this", "don't forget"],
    isDefault: true,
    enabled: true,
    content: `# Skill: Memory (write_mem)

## What this is
You have a small persistent memory, separate from this one conversation, that survives into
future conversations. read_mem("name") reads a saved memory (see the MEMORY section already in
your instructions for its exact syntax if the memory toggle is on). This skill is about
write_mem specifically: HOW to decide what is worth saving.

There are two separate memory lists, and they can never overwrite each other:
- Memories the USER created themselves (through the app's Mem tab) -- you can read these but
  never write, edit, or delete them.
- Memories YOU created with write_mem -- yours to create, update, and only these.

## When TO use write_mem (like a good memory feature, not a transcript)
Save something when it is durable and would genuinely help a DIFFERENT, later conversation --
not just useful for finishing the current one:
- A clear, stated preference ("I always want code comments in English", "keep answers short").
- Ongoing project context that will matter again (the name/stack of a project they keep coming
  back to, a convention they've asked you to follow every time).
- A correction they gave you about something you got wrong, if it's the kind of thing you might
  get wrong again later ("no, in my codebase we use tabs not spaces").

## When NOT to use write_mem
- One-off facts only relevant to finishing THIS answer (today's weather, a number you just
  calculated, the current contents of a file you're editing right now).
- Anything sensitive the user hasn't clearly volunteered for this purpose (passwords, financial
  details, health information, anything about a third party).
- Something you are not confident is actually true or durable -- if in doubt, don't save it, or
  ask the user first.
- Never save something just because it was SAID, without judging whether it is worth
  remembering -- that turns memory into a noisy transcript instead of a useful one.

## Being transparent
When you do save or update something, say so in one short, plain sentence (e.g. "Noted -- I'll
remember you prefer short answers.") so the user can correct it if it's wrong. Never save
silently, and never make a show of it either -- one line, then move on.`,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
];
