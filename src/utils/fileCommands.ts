import JSZip from "jszip";
import { VirtualFile } from "../types";

export function isBinaryFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const binaryExtensions = new Set([
    "zip", "gz", "tar", "tgz", "rar", "7z", "bz2", "xz",
    "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "tiff",
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "mp3", "wav", "ogg", "mp4", "webm", "avi", "mov",
    "bin", "exe", "dll", "so", "dylib", "iso", "pyc", "class", "db", "sqlite"
  ]);
  return binaryExtensions.has(ext);
}

export function getFileLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "html":
    case "htm":
      return "html";
    case "md":
    case "markdown":
      return "markdown";
    case "js":
    case "mjs":
    case "cjs":
      return "javascript";
    case "ts":
      return "typescript";
    case "tsx":
      return "typescript";
    case "jsx":
      return "javascript";
    case "css":
      return "css";
    case "json":
      return "json";
    case "svg":
      return "svg";
    case "py":
      return "python";
    case "txt":
    default:
      return "text";
  }
}

export function getFileCategory(filePath: string): string {
  const ext = filePath.split(".").pop()?.toUpperCase() || "TXT";
  switch (ext) {
    case "HTML":
    case "HTM":
      return "Code · HTML";
    case "MD":
    case "MARKDOWN":
      return "Document · MD";
    case "JS":
    case "MJS":
      return "Code · JS";
    case "TS":
      return "Code · TS";
    case "TSX":
      return "Code · TSX";
    case "JSX":
      return "Code · JSX";
    case "CSS":
      return "Code · CSS";
    case "JSON":
      return "Data · JSON";
    case "SVG":
      return "Vector · SVG";
    case "PY":
      return "Code · PY";
    default:
      return `Document · ${ext}`;
  }
}

export interface ParsedWriteCommand {
  filePath: string;
  content: string;
  fullMatch: string;
}

export interface ParsedEditCommand {
  filePath: string;
  oldString: string;
  newString: string;
  replaceAll: boolean;
  fullMatch: string;
}

export interface ParsedReadCommand {
  filePath: string;
  offset: number;
  limit: number;
  fullMatch: string;
}

export interface ParsedGlobCommand {
  pattern: string;
  path: string;
  fullMatch: string;
}

export interface ParsedGrepCommand {
  pattern: string;
  path: string;
  glob: string;
  type: string;
  outputMode: string;
  fullMatch: string;
}

export interface ParsedDeleteCommand {
  filePath: string;
  fullMatch: string;
}

export interface ParsedMoveCommand {
  sourcePath: string;
  destinationPath: string;
  fullMatch: string;
}

export interface ParsedGitDiffCommand {
  filePath: string;
  fullMatch: string;
}

export interface ParsedGitCheckoutCommand {
  filePath: string;
  fullMatch: string;
}

// Helper to normalize path (remove leading ./ or /)
export function normalizeFilePath(p: string): string {
  return p.trim().replace(/^(\.\/|\/)+/, "");
}

// Helper to clean and unescape file contents
export function unescapeFileContent(raw: string): string {
  if (!raw) return "";
  let c = raw;
  if ((c.startsWith('"""') && c.endsWith('"""')) || (c.startsWith("'''") && c.endsWith("'''"))) {
    c = c.slice(3, -3);
  } else if (c.startsWith("```") && c.endsWith("```")) {
    c = c.slice(3, -3);
  } else if ((c.startsWith('"') && c.endsWith('"')) || (c.startsWith("'") && c.endsWith("'")) || (c.startsWith("`") && c.endsWith("`"))) {
    c = c.slice(1, -1);
  }

  // Handle literal escape sequences if present
  if (c.includes("\\n") || c.includes("\\t") || c.includes('\\"') || c.includes("\\'")) {
    try {
      c = c
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'");
    } catch {
      // fallback
    }
  }
  return c;
}

// Parse Write(...) commands
export function parseWriteCommands(text: string): ParsedWriteCommand[] {
  if (!text) return [];
  const results: ParsedWriteCommand[] = [];

  // Match Write( or write( with optional codeblock prefixes
  const writeHeaderRegex = /(?:```[a-z]*\s*|`\s*)?Write\s*\(\s*(?:(?:file_path|path)\s*=\s*)?["'“”‘’]([^"'“”‘’\r\n]+)["'“”‘’]\s*,\s*(?:content\s*=\s*)?/gi;

  let match: RegExpExecArray | null = null;
  while ((match = writeHeaderRegex.exec(text)) !== null) {
    const filePath = normalizeFilePath(match[1]);
    const startIndex = match.index;
    const headerLen = match[0].length;
    const rest = text.slice(startIndex + headerLen);

    let content = "";
    let matchEnd = startIndex + headerLen;

    // Check multi-quote delimiters: 3+ double quotes, 3+ single quotes, 3+ backticks, or ```...
    const multiQuoteMatch = rest.match(/^("{3,}|'{3,}|`{3,}|```[a-z]*\n?)/);
    if (multiQuoteMatch) {
      const openSeq = multiQuoteMatch[0];
      const searchFrom = openSeq.length;
      const quoteChar = openSeq.startsWith('"') ? '"' : openSeq.startsWith("'") ? "'" : "`";
      
      // Look for closing matching quote sequence followed by optional closing paren
      const closeRegex = new RegExp(`[\\r\\n\\s]*${quoteChar}{3,}[\\s\\S]*?\\)(?:\\s*(?:\`\`\`|\`))?`, 'g');
      closeRegex.lastIndex = searchFrom;
      const closeMatch = closeRegex.exec(rest);

      if (closeMatch) {
        const closeIdx = closeMatch.index;
        content = rest.slice(searchFrom, closeIdx);
        matchEnd += closeIdx + closeMatch[0].length;
      } else {
        // Fallback: look for just 3+ quotes
        const fallbackCloseRegex = new RegExp(`${quoteChar}{3,}`, 'g');
        fallbackCloseRegex.lastIndex = searchFrom;
        const fallbackClose = fallbackCloseRegex.exec(rest);
        if (fallbackClose) {
          content = rest.slice(searchFrom, fallbackClose.index);
          const afterTriple = rest.slice(fallbackClose.index + fallbackClose[0].length);
          const closeParen = afterTriple.match(/^\s*\)(?:\s*(?:```|`))?/);
          matchEnd += fallbackClose.index + fallbackClose[0].length + (closeParen ? closeParen[0].length : 0);
        } else {
          // Unclosed / in-progress stream: match to the end of text
          content = rest.slice(searchFrom);
          matchEnd = text.length;
        }
      }
    } else if (rest.startsWith('"') || rest.startsWith("'") || rest.startsWith("`")) {
      const openChar = rest[0];
      let i = 1;
      let inEscape = false;
      let closed = false;
      while (i < rest.length) {
        if (inEscape) {
          inEscape = false;
          i++;
          continue;
        }
        if (rest[i] === "\\") {
          inEscape = true;
          i++;
          continue;
        }
        if (rest[i] === openChar) {
          closed = true;
          break;
        }
        i++;
      }
      if (closed) {
        content = rest.slice(1, i);
        const afterClose = rest.slice(i + 1);
        const closeParenMatch = afterClose.match(/^\s*\)(?:\s*(?:```|`))?/);
        matchEnd += i + 1 + (closeParenMatch ? closeParenMatch[0].length : 0);
      } else {
        content = rest.slice(1);
        matchEnd = text.length;
      }
    } else {
      // General paren balancing
      let parenCount = 1;
      let inString: string | null = null;
      let inEscape = false;
      let i = 0;

      while (i < rest.length) {
        const char = rest[i];
        if (inEscape) {
          inEscape = false;
          i++;
          continue;
        }
        if (char === "\\") {
          inEscape = true;
          i++;
          continue;
        }
        if (inString) {
          if (char === inString) {
            inString = null;
          }
        } else {
          if (char === '"' || char === "'" || char === "`") {
            inString = char;
          } else if (char === "(") {
            parenCount++;
          } else if (char === ")") {
            parenCount--;
            if (parenCount === 0) {
              break;
            }
          }
        }
        i++;
      }

      if (i < rest.length && parenCount === 0) {
        content = rest.slice(0, i);
        matchEnd += i + 1;
        const tail = text.slice(matchEnd);
        const closingTicks = tail.match(/^\s*(?:```|`)/);
        if (closingTicks) {
          matchEnd += closingTicks[0].length;
        }
      } else {
        // Unclosed / in-progress stream: take rest to end
        content = rest.replace(/\)\s*(?:```|`)?$/, "").trim();
        matchEnd = text.length;
      }
    }

    content = unescapeFileContent(content);

    const fullMatch = text.slice(startIndex, matchEnd);
    results.push({
      filePath,
      content,
      fullMatch,
    });
  }

  return results;
}

// Parse Edit(file_path, old_string, new_string, replace_all?)
export function parseEditCommands(text: string): ParsedEditCommand[] {
  if (!text) return [];
  const results: ParsedEditCommand[] = [];

  // Edit("file", "old", "new", true|false) with multi-quote / triple-quote support
  const editRegex = /(?:```[a-z]*\s*|`\s*)?Edit\s*\(\s*(?:(?:file_path|path)\s*=\s*)?["'“”‘’]([^"'“”‘’\r\n]+)["'“”‘’]\s*,\s*(?:(?:old_string|old)\s*=\s*)?(?:"""|'''|```[a-z]*\n?|"|'|`)([\s\S]*?)(?:"""|'''|```|"|'|`)\s*,\s*(?:(?:new_string|new)\s*=\s*)?(?:"""|'''|```[a-z]*\n?|"|'|`)([\s\S]*?)(?:"""|'''|```|"|'|`)(?:\s*,\s*(?:replace_all\s*=\s*)?(true|false))?\s*\)(?:\s*(?:```|`))?/gi;

  let match: RegExpExecArray | null = null;
  while ((match = editRegex.exec(text)) !== null) {
    results.push({
      filePath: normalizeFilePath(match[1]),
      oldString: match[2],
      newString: match[3],
      replaceAll: match[4]?.toLowerCase() === "true",
      fullMatch: match[0],
    });
  }

  return results;
}

// Parse Read(file_path, offset?, limit?)
export function parseReadCommands(text: string): ParsedReadCommand[] {
  if (!text) return [];
  const results: ParsedReadCommand[] = [];

  const readRegex = /(?:```[a-z]*\s*|`\s*)?Read\s*\(\s*(?:file_path\s*=\s*)?["'“”‘’]([^"'“”‘’\r\n]+)["'“”‘’](?:\s*,\s*(?:offset\s*=\s*)?(\d+))?(?:\s*,\s*(?:limit\s*=\s*)?(\d+))?\s*\)(?:\s*(?:```|`))?/gi;

  let match: RegExpExecArray | null = null;
  while ((match = readRegex.exec(text)) !== null) {
    results.push({
      filePath: normalizeFilePath(match[1]),
      offset: match[2] ? parseInt(match[2], 10) : 1,
      limit: match[3] ? parseInt(match[3], 10) : 2000,
      fullMatch: match[0],
    });
  }

  return results;
}

// Parse Glob(pattern, path?)
export function parseGlobCommands(text: string): ParsedGlobCommand[] {
  if (!text) return [];
  const results: ParsedGlobCommand[] = [];

  const globRegex = /(?:```[a-z]*\s*|`\s*)?Glob\s*\(\s*(?:pattern\s*=\s*)?["'“”‘’]([^"'“”‘’\r\n]+)["'“”‘’](?:\s*,\s*(?:path\s*=\s*)?["'“”‘’]([^"'“”‘’\r\n]+)["'“”‘’])?\s*\)(?:\s*(?:```|`))?/gi;

  let match: RegExpExecArray | null = null;
  while ((match = globRegex.exec(text)) !== null) {
    results.push({
      pattern: match[1].trim(),
      path: match[2] ? normalizeFilePath(match[2]) : ".",
      fullMatch: match[0],
    });
  }

  return results;
}

// Parse Grep(pattern, path?, glob?, type?, output_mode?)
export function parseGrepCommands(text: string): ParsedGrepCommand[] {
  if (!text) return [];
  const results: ParsedGrepCommand[] = [];

  const grepRegex = /(?:```[a-z]*\s*|`\s*)?Grep\s*\(\s*(?:pattern\s*=\s*)?["'“”‘’]([^"'“”‘’\r\n]+)["'“”‘’](?:\s*,\s*(?:path\s*=\s*)?["'“”‘’]([^"'“”‘’\r\n]*)["'“”‘’])?(?:\s*,\s*(?:glob\s*=\s*)?["'“”‘’]([^"'“”‘’\r\n]*)["'“”‘’])?(?:\s*,\s*(?:type\s*=\s*)?["'“”‘’]([^"'“”‘’\r\n]*)["'“”‘’])?(?:\s*,\s*(?:output_mode\s*=\s*)?["'“”‘’]([^"'“”‘’\r\n]*)["'“”‘’])?\s*\)(?:\s*(?:```|`))?/gi;

  let match: RegExpExecArray | null = null;
  while ((match = grepRegex.exec(text)) !== null) {
    results.push({
      pattern: match[1].trim(),
      path: match[2] ? normalizeFilePath(match[2]) : ".",
      glob: match[3] ? match[3].trim() : "*",
      type: match[4] ? match[4].trim() : "content",
      outputMode: match[5] ? match[5].trim() : "standard",
      fullMatch: match[0],
    });
  }

  return results;
}

// Parse Delete(path)
export function parseDeleteCommands(text: string): ParsedDeleteCommand[] {
  if (!text) return [];
  const results: ParsedDeleteCommand[] = [];

  const deleteRegex = /(?:```[a-z]*\s*|`\s*)?Delete\s*\(\s*(?:(?:path|file_path)\s*=\s*)?["'“”‘’]([^"'“”‘’\r\n]+)["'“”‘’]\s*\)(?:\s*(?:```|`))?/gi;

  let match: RegExpExecArray | null = null;
  while ((match = deleteRegex.exec(text)) !== null) {
    results.push({
      filePath: normalizeFilePath(match[1]),
      fullMatch: match[0],
    });
  }

  return results;
}

// Parse Move(source, destination)
export function parseMoveCommands(text: string): ParsedMoveCommand[] {
  if (!text) return [];
  const results: ParsedMoveCommand[] = [];

  const moveRegex = /(?:```[a-z]*\s*|`\s*)?Move\s*\(\s*(?:(?:source|source_path|src)\s*=\s*)?["'“”‘’]([^"'“”‘’\r\n]+)["'“”‘’]\s*,\s*(?:(?:destination|destination_path|dst|dest)\s*=\s*)?["'“”‘’]([^"'“”‘’\r\n]+)["'“”‘’]\s*\)(?:\s*(?:```|`))?/gi;

  let match: RegExpExecArray | null = null;
  while ((match = moveRegex.exec(text)) !== null) {
    results.push({
      sourcePath: normalizeFilePath(match[1]),
      destinationPath: normalizeFilePath(match[2]),
      fullMatch: match[0],
    });
  }

  return results;
}

// Parse GitDiff(path)
export function parseGitDiffCommands(text: string): ParsedGitDiffCommand[] {
  if (!text) return [];
  const results: ParsedGitDiffCommand[] = [];

  const diffRegex = /(?:```[a-z]*\s*|`\s*)?GitDiff\s*\(\s*(?:(?:path|file_path)\s*=\s*)?["'“”‘’]([^"'“”‘’\r\n]+)["'“”‘’]\s*\)(?:\s*(?:```|`))?/gi;

  let match: RegExpExecArray | null = null;
  while ((match = diffRegex.exec(text)) !== null) {
    results.push({
      filePath: normalizeFilePath(match[1]),
      fullMatch: match[0],
    });
  }

  return results;
}

// Parse GitCheckout(path)
export function parseGitCheckoutCommands(text: string): ParsedGitCheckoutCommand[] {
  if (!text) return [];
  const results: ParsedGitCheckoutCommand[] = [];

  const checkoutRegex = /(?:```[a-z]*\s*|`\s*)?GitCheckout\s*\(\s*(?:(?:path|file_path)\s*=\s*)?["'“”‘’]([^"'“”‘’\r\n]+)["'“”‘’]\s*\)(?:\s*(?:```|`))?/gi;

  let match: RegExpExecArray | null = null;
  while ((match = checkoutRegex.exec(text)) !== null) {
    results.push({
      filePath: normalizeFilePath(match[1]),
      fullMatch: match[0],
    });
  }

  return results;
}

// Strip all raw file commands from text
export function stripAllFileCommands(text: string): string {
  if (!text) return "";
  let clean = text;

  const writeCmds = parseWriteCommands(clean);
  for (const w of writeCmds) {
    clean = clean.replace(w.fullMatch, "");
  }

  const editCmds = parseEditCommands(clean);
  for (const e of editCmds) {
    clean = clean.replace(e.fullMatch, "");
  }

  const readCmds = parseReadCommands(clean);
  for (const r of readCmds) {
    clean = clean.replace(r.fullMatch, "");
  }

  const globCmds = parseGlobCommands(clean);
  for (const g of globCmds) {
    clean = clean.replace(g.fullMatch, "");
  }

  const grepCmds = parseGrepCommands(clean);
  for (const gr of grepCmds) {
    clean = clean.replace(gr.fullMatch, "");
  }

  const deleteCmds = parseDeleteCommands(clean);
  for (const d of deleteCmds) {
    clean = clean.replace(d.fullMatch, "");
  }

  const moveCmds = parseMoveCommands(clean);
  for (const m of moveCmds) {
    clean = clean.replace(m.fullMatch, "");
  }

  const diffCmds = parseGitDiffCommands(clean);
  for (const df of diffCmds) {
    clean = clean.replace(df.fullMatch, "");
  }

  const checkoutCmds = parseGitCheckoutCommands(clean);
  for (const co of checkoutCmds) {
    clean = clean.replace(co.fullMatch, "");
  }

  // Also strip any partial / unclosed file command at end of stream
  clean = clean.replace(/\b(?:Write|Edit|Read|Glob|Grep|Delete|Move|GitDiff|GitCheckout)\s*\([^)]*$/gi, "");

  return clean.trim();
}

// Execute Write
export function executeWrite(
  files: Record<string, VirtualFile>,
  filePath: string,
  content: string
): { updatedFiles: Record<string, VirtualFile>; result: string; savedFile: VirtualFile } {
  const normPath = normalizeFilePath(filePath);
  const name = normPath.split("/").pop() || normPath;
  const language = getFileLanguage(normPath);
  const cleanContent = unescapeFileContent(content);
  const existing = files[normPath];
  const savedFile: VirtualFile = {
    path: normPath,
    name,
    content: cleanContent,
    originalContent: existing ? (existing.originalContent ?? existing.content) : cleanContent,
    previousContent: existing ? existing.content : undefined,
    language,
    size: new Blob([cleanContent]).size,
    updatedAt: Date.now(),
  };

  const updatedFiles = {
    ...files,
    [normPath]: savedFile,
  };

  // Sync write to server disk
  trackDiskOp(normPath, uploadFileToWorkspace(normPath, cleanContent));

  return {
    updatedFiles,
    result: existing
      ? `Successfully edited file ${normPath}`
      : `Successfully created file ${normPath}`,
    savedFile,
  };
}

// Execute Read
export function executeRead(
  files: Record<string, VirtualFile>,
  filePath: string,
  offset: number = 1,
  limit: number = 2000
): string {
  const normPath = normalizeFilePath(filePath);
  const file = files[normPath];
  if (!file) {
    return `Error: file not found: ${normPath}. Use Glob("*") to list existing files.`;
  }

  const lines = file.content.split("\n");
  const startLine = Math.max(1, offset) - 1;
  const slicedLines = lines.slice(startLine, startLine + limit);
  const formatted = slicedLines
    .map((line, idx) => `${startLine + idx + 1}: ${line}`)
    .join("\n");

  return `Reading file ${normPath} with offset: ${offset} and limit: ${limit}\nContent:\n${formatted}`;
}

// Execute Edit
export function executeEdit(
  files: Record<string, VirtualFile>,
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll: boolean = false
): { updatedFiles: Record<string, VirtualFile>; result: string; savedFile?: VirtualFile } {
  const normPath = normalizeFilePath(filePath);
  const file = files[normPath];
  if (!file) {
    return {
      updatedFiles: files,
      result: `Error: file not found: ${normPath}`,
    };
  }

  if (!file.content.includes(oldString)) {
    return {
      updatedFiles: files,
      result: `Error: old_string not found in file ${normPath}. Read the file first to verify exact content.`,
    };
  }

  const lines = file.content.split("\n");
  const modifiedLineNumbers: number[] = [];
  lines.forEach((line, idx) => {
    if (line.includes(oldString)) {
      modifiedLineNumbers.push(idx + 1);
    }
  });

  const newContent = replaceAll
    ? file.content.replaceAll(oldString, newString)
    : file.content.replace(oldString, newString);

  const savedFile: VirtualFile = {
    ...file,
    content: newContent,
    originalContent: file.originalContent ?? file.content,
    previousContent: file.content,
    size: new Blob([newContent]).size,
    updatedAt: Date.now(),
  };

  const updatedFiles = {
    ...files,
    [normPath]: savedFile,
  };

  trackDiskOp(normPath, uploadFileToWorkspace(normPath, newContent));

  const lineStr = modifiedLineNumbers.length > 0 ? modifiedLineNumbers.join(", ") : "1";
  return {
    updatedFiles,
    result: `done\nLines modified: ${lineStr}`,
    savedFile,
  };
}

// Execute Delete
export function executeDelete(
  files: Record<string, VirtualFile>,
  filePath: string
): { updatedFiles: Record<string, VirtualFile>; result: string; deletedPath?: string } {
  const normPath = normalizeFilePath(filePath);
  if (!files[normPath]) {
    trackDiskOp(normPath, deleteFileFromWorkspace(normPath));
    return {
      updatedFiles: files,
      result: `Error: file not found: ${normPath}`,
    };
  }

  const updatedFiles = { ...files };
  delete updatedFiles[normPath];

  deleteFileFromWorkspace(normPath);

  return {
    updatedFiles,
    result: `Successfully deleted file ${normPath}`,
    deletedPath: normPath,
  };
}

// Execute Move
export function executeMove(
  files: Record<string, VirtualFile>,
  sourcePath: string,
  destinationPath: string
): { updatedFiles: Record<string, VirtualFile>; result: string; movedFile?: VirtualFile } {
  const src = normalizeFilePath(sourcePath);
  const dst = normalizeFilePath(destinationPath);

  const file = files[src];
  if (!file) {
    return {
      updatedFiles: files,
      result: `Error: source file not found: ${src}`,
    };
  }

  const updatedFiles = { ...files };
  delete updatedFiles[src];

  const movedFile: VirtualFile = {
    ...file,
    path: dst,
    name: dst.split("/").pop() || dst,
    language: getFileLanguage(dst),
    updatedAt: Date.now(),
  };

  updatedFiles[dst] = movedFile;

  trackDiskOp(src, deleteFileFromWorkspace(src));
  trackDiskOp(dst, uploadFileToWorkspace(dst, file.content));

  return {
    updatedFiles,
    result: `Successfully moved ${src} to ${dst}`,
    movedFile,
  };
}

// Compute unified git diff
export function computeGitDiff(filePath: string, oldStr: string, newStr: string): string {
  if (oldStr === newStr) {
    return `diff --git a/${filePath} b/${filePath}\nNo changes detected in ${filePath}`;
  }

  const oldLines = oldStr ? oldStr.split("\n") : [];
  const newLines = newStr ? newStr.split("\n") : [];

  const lcsMatrix: number[][] = Array(oldLines.length + 1)
    .fill(0)
    .map(() => Array(newLines.length + 1).fill(0));

  for (let r = 0; r < oldLines.length; r++) {
    for (let c = 0; c < newLines.length; c++) {
      if (oldLines[r] === newLines[c]) {
        lcsMatrix[r + 1][c + 1] = lcsMatrix[r][c] + 1;
      } else {
        lcsMatrix[r + 1][c + 1] = Math.max(lcsMatrix[r + 1][c], lcsMatrix[r][c + 1]);
      }
    }
  }

  let r = oldLines.length;
  let c = newLines.length;
  const diffEntries: { type: "same" | "del" | "add"; text: string }[] = [];

  while (r > 0 || c > 0) {
    if (r > 0 && c > 0 && oldLines[r - 1] === newLines[c - 1]) {
      diffEntries.unshift({ type: "same", text: oldLines[r - 1] });
      r--;
      c--;
    } else if (c > 0 && (r === 0 || lcsMatrix[r][c - 1] >= lcsMatrix[r - 1][c])) {
      diffEntries.unshift({ type: "add", text: newLines[c - 1] });
      c--;
    } else if (r > 0 && (c === 0 || lcsMatrix[r][c - 1] < lcsMatrix[r - 1][c])) {
      diffEntries.unshift({ type: "del", text: oldLines[r - 1] });
      r--;
    }
  }

  const diffLines: string[] = [];
  diffLines.push(`diff --git a/${filePath} b/${filePath}`);
  diffLines.push(`--- a/${filePath}`);
  diffLines.push(`+++ b/${filePath}`);
  diffLines.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`);

  for (const entry of diffEntries) {
    if (entry.type === "same") {
      diffLines.push(` ${entry.text}`);
    } else if (entry.type === "del") {
      diffLines.push(`-${entry.text}`);
    } else if (entry.type === "add") {
      diffLines.push(`+${entry.text}`);
    }
  }

  return diffLines.join("\n");
}

// Execute GitDiff
export function executeGitDiff(
  files: Record<string, VirtualFile>,
  filePath: string
): string {
  const normPath = normalizeFilePath(filePath);
  const file = files[normPath];
  if (!file) {
    return `Error: file not found: ${normPath}`;
  }

  const oldContent = file.previousContent !== undefined ? file.previousContent : (file.originalContent ?? "");
  const currentContent = file.content;

  return computeGitDiff(normPath, oldContent, currentContent);
}

// Execute GitCheckout
export function executeGitCheckout(
  files: Record<string, VirtualFile>,
  filePath: string
): { updatedFiles: Record<string, VirtualFile>; result: string; revertedFile?: VirtualFile } {
  const normPath = normalizeFilePath(filePath);
  const file = files[normPath];
  if (!file) {
    return {
      updatedFiles: files,
      result: `Error: file not found: ${normPath}`,
    };
  }

  const revertTo = file.previousContent !== undefined ? file.previousContent : file.originalContent;
  if (revertTo === undefined) {
    return {
      updatedFiles: files,
      result: `Error: no previous version found for ${normPath}`,
    };
  }

  const revertedFile: VirtualFile = {
    ...file,
    content: revertTo,
    previousContent: file.content,
    size: new Blob([revertTo]).size,
    updatedAt: Date.now(),
  };

  const updatedFiles = {
    ...files,
    [normPath]: revertedFile,
  };

  return {
    updatedFiles,
    result: `Successfully reverted ${normPath} to previous version`,
    revertedFile,
  };
}

// Execute Glob
export function executeGlob(
  files: Record<string, VirtualFile>,
  pattern: string,
  _basePath: string = "."
): string {
  const allPaths = Object.keys(files);
  if (allPaths.length === 0) {
    return "Found 0 files:\n";
  }

  let matched = allPaths;
  if (pattern && pattern !== "*") {
    // Simple glob match: *.html, *.md, etc.
    const regexStr = "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$";
    try {
      const re = new RegExp(regexStr, "i");
      matched = allPaths.filter((p) => re.test(p) || re.test(p.split("/").pop() || ""));
    } catch {
      matched = allPaths.filter((p) => p.includes(pattern));
    }
  }

  if (matched.length === 0) {
    return `Found 0 files:`;
  }

  return `Found ${matched.length} files:\n` + matched.join("\n");
}

// Execute Grep
export function executeGrep(
  files: Record<string, VirtualFile>,
  pattern: string,
  _targetPath: string = ".",
  glob: string = "*"
): string {
  const allPaths = Object.keys(files);
  if (allPaths.length === 0) {
    return "No files in workspace to grep.";
  }

  let targetFiles = allPaths;
  if (glob && glob !== "*") {
    const regexStr = "^" + glob.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$";
    try {
      const re = new RegExp(regexStr, "i");
      targetFiles = allPaths.filter((p) => re.test(p));
    } catch {
      // ignore
    }
  }

  const matches: string[] = [];
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "i");
  } catch {
    regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }

  for (const filePath of targetFiles) {
    const file = files[filePath];
    if (!file) continue;
    const lines = file.content.split("\n");
    lines.forEach((line, idx) => {
      if (regex.test(line)) {
        matches.push(`${filePath}:${idx + 1}: ${line.trim()}`);
      }
    });
  }

  if (matches.length === 0) {
    return `No matches found for pattern "${pattern}".`;
  }

  return `Grep results for "${pattern}":\n` + matches.slice(0, 50).join("\n");
}

// Trigger browser download for a single file
export function downloadSingleFile(file: VirtualFile) {
  // Placeholder content ("[Large File ...]" / "[Binary File ...]") means the real bytes are only on disk: let the server stream them.
  if (/^\[(Large|Binary|Unreadable) File:/.test(file.content || "")) {
    const a = document.createElement("a");
    a.href = `/api/workspace/file?path=${encodeURIComponent(file.path)}`;
    a.download = file.name || file.path;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }
  let blob: Blob;
  if (file.encoding === "base64") {
    const bin = atob(file.content || "");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    blob = new Blob([bytes]);
  } else {
    blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name || file.path;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Trigger ZIP archive download for all files in a list using JSZip
export async function downloadAllFiles(files: VirtualFile[]) {
  if (!files || files.length === 0) return;
  try {
    const zip = new JSZip();
    for (const file of files) {
      zip.file(file.name || file.path, file.content || "", file.encoding === "base64" ? { base64: true } : undefined);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workspace_files_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Failed to generate zip file:", err);
    // Fallback to sequential single downloads
    files.forEach((file, index) => {
      setTimeout(() => {
        downloadSingleFile(file);
      }, index * 200);
    });
  }
}

// ---- pending disk-operation tracker -------------------------------------------
// execute*() below fire-and-forget their server disk writes so the UI stays
// snappy. Agent loops must await them before re-listing the workspace,
// otherwise a sync can overwrite the virtual map with pre-write disk state.
// flushWorkspaceWrites() awaits everything in flight and returns the paths
// that failed to persist.
const pendingDiskOps = new Map<string, Promise<boolean>>();
function trackDiskOp(opPath: string, p: Promise<boolean>): void {
  pendingDiskOps.set(opPath, p);
  void p.then(
    () => {
      if (pendingDiskOps.get(opPath) === p) pendingDiskOps.delete(opPath);
    },
    () => {
      if (pendingDiskOps.get(opPath) === p) pendingDiskOps.delete(opPath);
    }
  );
}

/** Await all in-flight workspace disk writes/deletes. Returns failed paths. */
export async function flushWorkspaceWrites(): Promise<string[]> {
  const entries = [...pendingDiskOps.entries()];
  pendingDiskOps.clear();
  const bad: string[] = [];
  await Promise.all(
    entries.map(async ([opPath, pr]) => {
      try {
        const ok = await pr;
        if (!ok) bad.push(opPath);
      } catch {
        bad.push(opPath);
      }
    })
  );
  return bad;
}

// Upload a file to server workspace disk
export async function uploadFileToWorkspace(name: string, content: string, encoding: "utf-8" | "base64" = "utf-8"): Promise<boolean> {
  try {
    const response = await fetch("/api/upload-workspace-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content, encoding }),
    });
    return response.ok;
  } catch (err) {
    console.error("Failed to upload file to workspace:", err);
    return false;
  }
}

// Delete a file from server workspace disk
export async function deleteFileFromWorkspace(filePath: string): Promise<boolean> {
  try {
    const response = await fetch("/api/delete-workspace-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath }),
    });
    return response.ok;
  } catch (err) {
    console.error("Failed to delete file from workspace:", err);
    return false;
  }
}

// Fetch all files currently present in server workspace directory
export async function syncServerWorkspaceFiles(existingFiles: Record<string, VirtualFile> = {}): Promise<Record<string, VirtualFile>> {
  try {
    const response = await fetch("/api/workspace-files");
    if (!response.ok) return { ...existingFiles };
    const data = await response.json();
    if (!data || !data.files) return { ...existingFiles };

    const merged: Record<string, VirtualFile> = {};
    for (const p of Object.keys(data.files)) {
      const f = data.files[p];
      const normPath = normalizeFilePath(p);
      const language = getFileLanguage(normPath);
      merged[normPath] = {
        path: normPath,
        name: f.name || normPath.split("/").pop() || normPath,
        content: f.content,
        originalContent: existingFiles[normPath]?.originalContent ?? f.content,
        language,
        size: f.size || new Blob([f.content]).size,
        updatedAt: f.updatedAt || Date.now(),
      };
    }
    return merged;
  } catch (err) {
    console.error("Failed to sync workspace files:", err);
    return { ...existingFiles };
  }
}

