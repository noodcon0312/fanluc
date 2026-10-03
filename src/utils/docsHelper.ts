// Helper for read_docs(...) command and docs skill
import fanlucUiDoc from "../../docs/fanluc_ui.md?raw";
export interface ReadDocCommand {
  docName: string;
  fullMatch: string;
}

const READ_DOCS_REGEX = /\bread_docs\s*\(\s*(?:doc\s*=\s*|name\s*=\s*|file\s*=\s*)?["'“”‘’]?([a-zA-Z0-9_\-./]+)["'“”‘’]?\s*\)(?:;)?/gi;

// Built-in fallback docs content in case server route is unreachable
export const FALLBACK_DOCS: Record<string, { fileName: string; content: string }> = {
  fanluc: {
    fileName: "fanluc_ui.md",
    content: fanlucUiDoc
  },
  guide: {
    fileName: "guide-connect.md",
    content: `Here is the connection code
(The user has successfully connected, which is why they are able to chat with you.)
So, when a user asks to switch models, search for and find the newest and best version on Hugging Face.
---

STEP 1: Get Your Ngrok Authtoken from ngrok Dashboard.
STEP 2: Set Up Google Colab with T4 GPU runtime.
STEP 3: Run Server Code with llama-cpp-python and ngrok tunnel to port 8000.
STEP 4: Connect to Web Client with API Base URL and API Key.`
  },
  mondk: {
    fileName: "mondk.md",
    content: `mondk is the creator of this website.
His page: https://huggingface.co/mondk
He started working on August 5, 2026.
When he was working at Hugging Face, Claude (a powerful AI) was very expensive—you would run out of usage after just two chats.
His logo consists of the letters M, S, and H layered over one another.
Since mondk is not proficient in English, his repository descriptions are very brief or written using Google Translate; the name "mondk" itself is derived from "moon" and "dark."`
  },
  msh: {
    fileName: "msh.md",
    content: `Regarding "Msh": the first letter (M) comes from "mondk";
"s" comes from "sound" (one of mondk's first projects);
and "h" is random.`
  }
};

export const LOCKED_DOCS_INSTRUCTION = `Documentation for this interface (the one you're in), and docs about msh, mondk, and fanluc. This documentation is meant to help you assist the user.

Use the following command:
read_docs(fanluc)
read_docs(mondk)
read_docs(msh)

It will return the content about msh, mondk, or fanluc.`;

/**
 * Check if the user prompt mentions fanluc, mondk, msh or related keywords
 */
export function shouldAutoLoadDocsSkill(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return /\b(fanluc|mondk|msh)\b/i.test(text);
}

/**
 * Check if text contains read_docs(...) calls
 */
export function hasReadDocsCommand(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return READ_DOCS_REGEX.test(text);
}

/**
 * Extract all read_docs commands from text
 */
export function parseReadDocsCommands(text: string): ReadDocCommand[] {
  if (!text || typeof text !== "string") return [];
  const results: ReadDocCommand[] = [];
  const regex = new RegExp(READ_DOCS_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const docName = (match[1] || "").trim().toLowerCase();
    if (docName) {
      results.push({
        docName,
        fullMatch: match[0],
      });
    }
  }

  return results;
}

/**
 * Strip all read_docs commands from text
 */
export function stripReadDocsCommands(text: string): string {
  if (!text || typeof text !== "string") return "";
  let clean = text.replace(READ_DOCS_REGEX, "");
  // Also strip any partial read_docs call at end of streaming string
  clean = clean.replace(/\bread_docs\s*\([^)]*$/gi, "");
  return clean;
}

/**
 * Execute a read_docs call by querying backend or fallback
 */
export async function executeReadDoc(docName: string): Promise<string> {
  const cleanName = (docName || "").trim().toLowerCase().replace(/^['"`]|['"`]$/g, "");
  if (!cleanName) {
    return "Error: Empty document name provided to read_docs.";
  }

  // 1. Try fetching from server /api/read-doc
  try {
    const response = await fetch("/api/read-doc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cleanName }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data?.found && data?.content) {
        return `doc: ${data.fileName}\ncontent:\n${data.content}`;
      }
    }
  } catch {
    // Fallback to local built-in definitions
  }

  // 2. Client-side fallback lookup
  let matchedKey = Object.keys(FALLBACK_DOCS).find((k) =>
    cleanName.includes(k) || k.includes(cleanName)
  );

  if (matchedKey && FALLBACK_DOCS[matchedKey]) {
    const doc = FALLBACK_DOCS[matchedKey];
    return `doc: ${doc.fileName}\ncontent:\n${doc.content}`;
  }

  return `doc: ${cleanName}\ncontent:\nDocument '${cleanName}' not found in /docs/ (Available: fanluc, guide, mondk, msh)`;
}
