// Real shell command execution runner (run_cmd).
//
// This replaces the old run_js (browser `new Function()` sandbox) and
// run_py (Pyodide/WASM) simulators. Those only faked code execution inside
// the browser tab and could never touch a real file, run `pip install`,
// `unzip`, `grep`, `git`, etc. run_cmd instead sends the command to the
// server's sandboxed /api/run-cmd endpoint (see server.ts: workspace-jailed
// cwd, stripped env, blocklist, timeout, optional firejail) and runs it for
// real — the same way Claude's own bash tool works.

export interface ParsedCodeCmd {
  type: "cmd";
  code: string;
  fullMatch: string;
  /** Character offset of the start of `fullMatch` within the text that was parsed. */
  matchStart: number;
  /** Character offset just past the end of `fullMatch` within the text that was parsed. */
  matchEnd: number;
}

// Matches a heredoc redirection starting a line: `cat > f << 'EOF'`, `<<-EOF`,
// `<< "EOF"`, `<< EOF` (unquoted). Captures the delimiter word only (group 2);
// quoting style doesn't matter for our purposes since either way the BODY is
// still literal text with no shell interpretation at all.
const HEREDOC_START_RE = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/;

/**
 * Accurately balances curly braces while respecting shell quoting/comments,
 * so a run_cmd{...} call whose command itself contains `{`/`}` (brace
 * expansion like {1..5}, JSON, etc.) is still parsed as a single call.
 *
 * Heredoc-aware: a heredoc body (`cat > file << 'EOF' ... EOF`) is raw
 * literal file content — bash does NOT treat `'`, `"`, `` ` `` or `#` inside
 * it as quoting/comment syntax. The previous version didn't know this, so
 * writing any file whose content contained a CSS hex color (`#000`) or an
 * apostrophe (`onclick="f('x')"`) made it misread a `#`/quote as starting a
 * shell comment or string, which then swallowed real `{`/`}` characters
 * (e.g. a CSS rule's closing brace) without counting them. That threw the
 * whole brace-depth count off, so the parser either cut the command short
 * (leaking the rest of the file's raw content, plus the AI's own trailing
 * reply text, into the visible chat) or, if it stayed unbalanced for the
 * rest of the string, folded the AI's trailing natural-language reply into
 * the shell command itself. Once we detect we're inside a heredoc body, we
 * stop interpreting quotes/comments there (only real `{`/`}` still count)
 * and only look for a line that is exactly the delimiter to exit it.
 */
export function parseBracedCommands(text: string, prefixRegex: RegExp): ParsedCodeCmd[] {
  if (!text || typeof text !== "string") return [];

  const results: ParsedCodeCmd[] = [];
  const regex = new RegExp(prefixRegex.source, "gi");

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const startIndex = match.index;
    const openBraceIdx = startIndex + match[0].lastIndexOf("{");

    let depth = 1;
    let i = openBraceIdx + 1;
    let inString: string | null = null;
    let inComment = false;
    let heredocDelim: string | null = null; // set while inside a heredoc body
    let lineStart = i; // index where the current line began (for heredoc/line checks)

    while (i < text.length && depth > 0) {
      const char = text[i];

      if (heredocDelim !== null) {
        // Inside a heredoc body: everything is literal text. The body ends
        // on a line that is (after optional leading whitespace, for `<<-`)
        // exactly the delimiter word, nothing else.
        if (char === "\n" || i === lineStart) {
          const lineEnd = text.indexOf("\n", char === "\n" ? i + 1 : i);
          const line = text.slice(char === "\n" ? i + 1 : i, lineEnd === -1 ? text.length : lineEnd);
          if (line.trim() === heredocDelim) {
            heredocDelim = null;
          }
        }
        if (char === "{") depth++;
        else if (char === "}") {
          depth--;
          if (depth === 0) break;
        } else if (char === "\n") {
          lineStart = i + 1;
        }
        i++;
        continue;
      }

      if (inComment) {
        if (char === "\n") {
          inComment = false;
          lineStart = i + 1;
        }
        i++;
        continue;
      }

      if (inString) {
        if (char === "\\" && i + 1 < text.length) {
          i += 2;
          continue;
        }
        if (char === inString) {
          inString = null;
        }
        if (char === "\n") lineStart = i + 1;
        i++;
        continue;
      }

      // Shell-style line comments
      if (char === "#") {
        inComment = true;
        i++;
        continue;
      }

      // Shell strings: single quotes, double quotes, and backticks
      if (char === '"' || char === "'" || char === "`") {
        inString = char;
        i++;
        continue;
      }

      if (char === "<" && text[i + 1] === "<") {
        // Only a REAL heredoc redirect: `<<` (optionally `<<-`) followed by
        // an identifier delimiter, not e.g. a plain `<<` inside other text.
        const restOfLine = text.slice(i, text.indexOf("\n", i) === -1 ? text.length : text.indexOf("\n", i));
        const heredocMatch = HEREDOC_START_RE.exec(restOfLine);
        if (heredocMatch && heredocMatch.index === 0) {
          heredocDelim = heredocMatch[2];
          i += heredocMatch[0].length;
          continue;
        }
      }

      if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) break;
      } else if (char === "\n") {
        lineStart = i + 1;
      }

      i++;
    }

    if (depth === 0) {
      const code = text.slice(openBraceIdx + 1, i);
      let matchEnd = i + 1;
      const tail = text.slice(matchEnd);
      const closeTicks = tail.match(/^\s*(?:```|`)/);
      if (closeTicks) matchEnd += closeTicks[0].length;

      const fullMatch = text.slice(startIndex, matchEnd);
      results.push({ type: "cmd", code, fullMatch, matchStart: startIndex, matchEnd });
      regex.lastIndex = matchEnd;
    } else {
      // Unclosed brace (still streaming) — take the rest of the text so
      // callers can at least detect "a run_cmd call is in progress".
      const code = text.slice(openBraceIdx + 1);
      const fullMatch = text.slice(startIndex);
      results.push({ type: "cmd", code, fullMatch, matchStart: startIndex, matchEnd: text.length });
      break;
    }
  }

  return results;
}

/** Parses all occurrences of run_cmd{...} in the given text. */
export function parseRunCmdCommands(text: string): ParsedCodeCmd[] {
  return parseBracedCommands(text, /\brun_cmd\s*\{/gi);
}

/** Strips all run_cmd{...} occurrences from text (for clean display). */
export function stripRunCodeCommands(text: string): string {
  if (!text || typeof text !== "string") return "";

  let cleaned = text;
  const cmds = parseRunCmdCommands(cleaned);
  for (const cmd of cmds) {
    cleaned = cleaned.replace(cmd.fullMatch, "");
  }
  // Catch any dangling/partial run_cmd{ ... left in the string.
  cleaned = cleaned.replace(/\brun_cmd\s*\{[\s\S]*?(?:\}|$)/gi, "");

  return cleaned.trim();
}

/** Parses all occurrences of replace_output{...} in the given text. */
export function parseReplaceOutputCommands(text: string): ParsedCodeCmd[] {
  return parseBracedCommands(text, /\breplace_output\s*\{/gi);
}

/** Strips all replace_output{...} occurrences from text (for clean display). */
export function stripReplaceOutputCommands(text: string): string {
  if (!text || typeof text !== "string") return "";
  let cleaned = text;
  for (const cmd of parseReplaceOutputCommands(cleaned)) {
    cleaned = cleaned.replace(cmd.fullMatch, "");
  }
  cleaned = cleaned.replace(/\breplace_output\s*\{[\s\S]*?(?:\}|$)/gi, "");
  return cleaned.trim();
}

// Exact, literal tags our own code inserts around each round of an
// autonomous tool-use turn (see App.tsx). Unlike the fuzzy "[INTERMED...]"
// matching used elsewhere for display tolerance, this needs to find the
// EXACT tag so it can safely locate a whole round's span in the raw text.
const INTERMEDIATE_OPEN = "[INTERMEDIATE]";
const INTERMEDIATE_CLOSE = "[/INTERMEDIATE]";

/**
 * Implements `replace_output{...}`: when the AI decides something it
 * already said earlier IN THIS SAME TURN was wrong (e.g. it guessed at an
 * answer, then a later search/fetch turned up the real one), it can call
 * replace_output{...} with the corrected message instead of just tacking
 * another "sorry, actually..." sentence onto the end. This function finds
 * the LAST replace_output{...} call in the raw text, drops everything from
 * the start of the text through the end of the round that contains it
 * (i.e. every earlier round, and that round's own original text), and
 * splices in the override text in its place — so the person only ever sees
 * the final, corrected message instead of a trail of wrong attempts. Any
 * rounds that happened AFTER the override are left untouched. A no-op
 * (returns the input unchanged) when no replace_output{...} call is found,
 * so it's always safe to run over any raw message.
 */
export function applyReplaceOutputOverride(rawText: string): string {
  if (!rawText || typeof rawText !== "string") return rawText;
  const cmds = parseReplaceOutputCommands(rawText);
  if (cmds.length === 0) return rawText;

  const last = cmds[cmds.length - 1];
  const overrideText = last.code.trim();

  // Find the end of the [INTERMEDIATE]-wrapped round that contains this
  // call (if any) so we cut on a clean round boundary, never mid-round.
  const closeIdx = rawText.indexOf(INTERMEDIATE_CLOSE, last.matchEnd);
  const segmentEnd = closeIdx === -1 ? rawText.length : closeIdx + INTERMEDIATE_CLOSE.length;

  const rest = rawText.slice(segmentEnd).trim();
  if (!rest) return overrideText;
  // If more [INTERMEDIATE]-wrapped rounds follow (the AI kept working after
  // correcting itself), keep the override as its own round in place, so it
  // still renders BEFORE those later rounds instead of being pulled down to
  // the bottom as if it were the final trailing text.
  if (rest.includes(INTERMEDIATE_OPEN)) {
    return `${INTERMEDIATE_OPEN}\n${overrideText}\n${INTERMEDIATE_CLOSE}\n\n${rest}`;
  }
  return `${overrideText}\n\n${rest}`;
}

// Fuzzy match for the [INTERMEDIATE]/[/INTERMEDIATE] wrapper tags, matching
// what ChatMessage.tsx tolerates for display, so a look-alike is caught too.
const FAKE_INTERMEDIATE_RE = /\[\/?INTERMED(?:IATE|IUM|IAT|IA|I|U)?\]/gi;

/**
 * [INTERMEDIATE]/[/INTERMEDIATE] are markers OUR OWN CODE inserts around
 * each round of an autonomous tool-use turn, purely for the chat UI to know
 * where one round's text ends and the next begins — the model itself is
 * never shown these tags (the raw, unwrapped text is what actually goes
 * back into its context) and should never type them. If a model ever DOES
 * echo one (most often because it saw one leak into a `list_history` /
 * `see_history` result — now fixed at the source in historyHelper.ts, but
 * this is kept as a second line of defense for older sessions or other
 * models that pick up the pattern some other way), stripping it here stops
 * a hallucinated tag from being mistaken for a real round boundary and
 * showing up as literal bracket text in the chat.
 */
export function stripFakeIntermediateTags(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text.replace(FAKE_INTERMEDIATE_RE, "").trim();
}

/** run_cmd_bg{...}: starts a command in the background (does not block waiting for it to finish). */
export function parseRunCmdBgCommands(text: string): ParsedCodeCmd[] {
  return parseBracedCommands(text, /\brun_cmd_bg\s*\{/gi);
}
export function stripRunCmdBgCommands(text: string): string {
  if (!text || typeof text !== "string") return "";
  let cleaned = text;
  for (const cmd of parseRunCmdBgCommands(cleaned)) cleaned = cleaned.replace(cmd.fullMatch, "");
  cleaned = cleaned.replace(/\brun_cmd_bg\s*\{[\s\S]*?(?:\}|$)/gi, "");
  return cleaned.trim();
}

export interface ParsedBgCallCmd {
  fullMatch: string;
  args: string[];
}

function parseBgCallCommands(text: string, name: string): ParsedBgCallCmd[] {
  if (!text || typeof text !== "string") return [];
  const results: ParsedBgCallCmd[] = [];
  const re = new RegExp(`\\b${name}\\s*\\(\\s*([^)]*)\\)`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const args = m[1]
      .split(",")
      .map((a) => a.trim().replace(/^["'`]|["'`]$/g, ""))
      .filter((a) => a.length > 0);
    results.push({ fullMatch: m[0], args });
  }
  return results;
}
function stripBgCallCommands(text: string, name: string): string {
  if (!text || typeof text !== "string") return "";
  let cleaned = text;
  for (const cmd of parseBgCallCommands(cleaned, name)) cleaned = cleaned.replace(cmd.fullMatch, "");
  return cleaned.trim();
}

export function parseListCmdBgCommands(text: string): ParsedBgCallCmd[] {
  return parseBgCallCommands(text, "list_cmd_bg");
}
export function stripListCmdBgCommands(text: string): string {
  return stripBgCallCommands(text, "list_cmd_bg");
}
export function parseKillCmdBgCommands(text: string): ParsedBgCallCmd[] {
  return parseBgCallCommands(text, "kill_cmd_bg");
}
export function stripKillCmdBgCommands(text: string): string {
  return stripBgCallCommands(text, "kill_cmd_bg");
}
export function parseReadCmdBgLogCommands(text: string): ParsedBgCallCmd[] {
  return parseBgCallCommands(text, "read_cmd_bg_log");
}
export function stripReadCmdBgLogCommands(text: string): string {
  return stripBgCallCommands(text, "read_cmd_bg_log");
}

async function postJson(url: string, body: any, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return { formattedText: `Execution Error: server returned ${response.status}${errText ? ` - ${errText}` : ""}` };
    }
    return await response.json();
  } catch (err: any) {
    if (err?.name === "AbortError") return { formattedText: "Execution Error: request timed out" };
    return { formattedText: `Execution Error: ${err?.message || String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}

/** Starts a command in the background; returns its id right away (the command keeps running after this returns). */
export async function executeRunCmdBg(rawCommand: string): Promise<string> {
  const command = rawCommand.trim();
  if (!command) return "";
  const data = await postJson("/api/run-cmd-bg", { command }, 10000);
  return data.formattedText || "(no output)";
}

export async function executeListCmdBg(): Promise<string> {
  const data = await postJson("/api/list-cmd-bg", {}, 10000);
  return data.formattedText || "(no output)";
}

export async function executeKillCmdBg(id: string): Promise<string> {
  const data = await postJson("/api/kill-cmd-bg", { id: (id || "").trim() }, 10000);
  return data.formattedText || "(no output)";
}

export async function executeReadCmdBgLog(id: string, offset?: string | number, limit?: string | number): Promise<string> {
  const data = await postJson(
    "/api/read-cmd-bg-log",
    { id: (id || "").trim(), offset: offset ?? 1, limit: limit ?? 200 },
    10000
  );
  return data.formattedText || "(no output)";
}

/**
 * Executes a real shell command through the server's /api/run-cmd endpoint.
 * Self-host edition: NO sandbox. It runs on the user's own machine, in the
 * workspace folder the user picked (python, node, pip, git... all real).
 */
export async function executeRunCmd(rawCommand: string, timeoutMs: number = 120000, workspaceId?: string): Promise<string> {
  const command = rawCommand.trim();
  if (!command) return "";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs + 3000);

  try {
    const response = await fetch("/api/run-cmd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workspaceId ? { command, workspaceId, timeoutMs } : { command, timeoutMs }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return `Execution Error: server returned ${response.status}${errText ? ` - ${errText}` : ""}`;
    }

    const data = await response.json();
    return data.formattedText || data.stdout || data.stderr || "(no output)";
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return "Execution Error: request timed out";
    }
    return `Execution Error: ${err?.message || String(err)}`;
  } finally {
    clearTimeout(timer);
  }
}
