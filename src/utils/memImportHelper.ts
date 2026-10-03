import { ApiConfig, ChatMessage, MemEntry } from "../types";
import { sendChatMessage } from "./api";
import { newMemEntry } from "./memHelper";

export interface MemCandidate {
  name: string;
  keywords: string[];
  content: string;
}

const EXTRACTION_SYSTEM_PROMPT = `You analyze a chat conversation and extract a short list of durable, reusable facts worth
remembering for FUTURE conversations -- the same judgment a good memory feature uses, not a
transcript summary. Good candidates: a stated preference, ongoing project context, a correction
the user gave that would matter again. Bad candidates: one-off facts only relevant to finishing
that single exchange, anything sensitive not clearly meant to be remembered, small talk.

Respond with ONLY a JSON array (no markdown fence, no commentary), each item shaped exactly like:
{"name": "short_snake_case_name", "keywords": ["comma-ish", "list", "of", "trigger words"], "content": "the fact, in your own words, one or two sentences"}

Return an empty array [] if nothing in the conversation is worth remembering long-term. Return at
most 8 items.`;

function conversationToText(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-60) // cap: this is a one-shot extraction call, not the full agentic loop
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${(m.content || "").slice(0, 2000)}`)
    .join("\n\n");
}

function extractJsonArray(raw: string): any[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Sends the conversation to the configured AI with a dedicated extraction
 * prompt and returns candidate memories for the person to review -- nothing
 * is saved here. Throws on a real connection/API failure so the caller can
 * show an error instead of silently returning an empty list.
 */
export async function generateMemoriesFromSession(messages: ChatMessage[], config: ApiConfig): Promise<MemCandidate[]> {
  const conversationText = conversationToText(messages);
  if (!conversationText.trim()) return [];

  const raw = await sendChatMessage(
    [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: conversationText },
    ],
    { ...config, maxTokens: Math.min(config.maxTokens || 1000, 1500) }
  );

  const items = extractJsonArray(raw);
  const candidates: MemCandidate[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const name = String(item.name || "").trim();
    const content = String(item.content || "").trim();
    if (!name || !content) continue;
    const keywords = Array.isArray(item.keywords) ? item.keywords.map((k: any) => String(k).trim()).filter(Boolean) : [];
    candidates.push({ name, keywords, content });
  }
  return candidates.slice(0, 8);
}

export function candidatesToMemEntries(candidates: MemCandidate[]): MemEntry[] {
  return candidates.map((c) => newMemEntry(c.name, c.keywords, c.content));
}

/** Prompt the person copies into another AI (Claude, ChatGPT, Gemini...) to export what it knows about them. */
export const OTHER_AI_EXPORT_PROMPT = `You are helping me transfer the information you know about me to another conversation.
Format:
\`\`\`text
User's name: ... (optional)
User information/characteristics: ...
Current topic of discussion: ...
New information provided by the user: ...
Conversation summary: ...
\`\`\``;

/**
 * Takes the text pasted from another AI's answer and has the configured AI
 * turn it into candidate memories for review. Nothing is saved here.
 */
export async function importMemoriesFromText(pastedText: string, config: ApiConfig): Promise<MemCandidate[]> {
  const text = pastedText.trim();
  if (!text) return [];

  // Try AI extraction first
  try {
    const raw = await sendChatMessage(
      [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT.replace("You analyze a chat conversation", "You analyze a context/memory summary exported from another AI assistant") },
        { role: "user", content: text.slice(0, 12000) },
      ],
      { ...config, maxTokens: Math.min(config.maxTokens || 1000, 1500) }
    );
    const items = extractJsonArray(raw);
    const candidates: MemCandidate[] = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const name = String(item.name || "").trim();
      const content = String(item.content || "").trim();
      if (!name || !content) continue;
      const keywords = Array.isArray(item.keywords) ? item.keywords.map((k: any) => String(k).trim()).filter(Boolean) : [];
      candidates.push({ name, keywords, content });
    }
    if (candidates.length > 0) return candidates.slice(0, 8);
  } catch (err) {
    console.warn("AI memory extraction failed, falling back to direct extraction:", err);
  }

  // Fallback: extract meaningful lines or bullet items directly from text
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("```"));

  const fallbackCandidates: MemCandidate[] = [];
  for (const line of rawLines) {
    const cleaned = line.replace(/^[-*•\d.)\]]+\s*/, "").trim();
    if (cleaned.length < 8) continue;
    // Check if line looks like "Category: content" or "Key: Value"
    const colonIdx = cleaned.indexOf(":");
    let name = "";
    let content = cleaned;
    if (colonIdx > 0 && colonIdx < 30) {
      name = cleaned.slice(0, colonIdx).trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
      content = cleaned.slice(colonIdx + 1).trim();
    }
    if (!content) continue;
    if (!name) {
      name = `memory_${fallbackCandidates.length + 1}`;
    }
    const words = content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !["the", "and", "for", "with", "this", "that", "user"].includes(w))
      .slice(0, 4);

    fallbackCandidates.push({
      name: name.slice(0, 30),
      keywords: words,
      content,
    });
    if (fallbackCandidates.length >= 8) break;
  }

  return fallbackCandidates;
}
