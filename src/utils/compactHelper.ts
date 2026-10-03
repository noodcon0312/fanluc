import { ChatMessage } from "../types";

// Minimum number of existing messages before /compact is allowed to run -
// no point burning a request to "compact" a couple of lines.
export const MIN_MESSAGES_TO_COMPACT = 4;

const COMPACT_SYSTEM_PROMPT = `You are a context-compaction assistant. You will be given a full conversation transcript between a user and an AI assistant. Your job is to rewrite it as a single, dense, well-structured summary that preserves everything needed to continue the conversation seamlessly, as if no information were lost.

Include, when present in the transcript:
- The user's overall goal(s) and any explicit requirements, constraints, or preferences they stated.
- Every concrete decision that was made and why.
- The current state of any code, files, or project being worked on (what exists, what changed, what's left to do).
- Key facts, numbers, or results obtained from tool calls (search results, fetched pages, calculations, etc).
- Any open questions, unresolved issues, or next steps that were pending.

Do NOT include: pleasantries, filler, meta-commentary about the conversation itself, or commentary about doing this summary.
Output ONLY the summary itself, using short headers and bullet points - nothing else.`;

export interface CompactRequestMessage {
  role: string;
  content: string;
}

function messagesToTranscript(messages: ChatMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.status === "error") continue;
    if (m.role === "user") {
      lines.push(`[USER]\n${(m.content || "").trim()}`);
      if (m.attachment?.name) {
        lines.push(`(user attached a file: ${m.attachment.name})`);
      }
    } else if (m.role === "assistant") {
      const content = (m.content || "").trim();
      if (content) lines.push(`[ASSISTANT]\n${content}`);
    }
  }
  return lines.join("\n\n");
}

export function buildCompactSummaryPayload(
  messages: ChatMessage[],
  focusInstruction?: string
): CompactRequestMessage[] {
  const transcript = messagesToTranscript(messages);
  const focusNote =
    focusInstruction && focusInstruction.trim()
      ? `\n\nWhen summarizing, pay special attention to this focus requested by the user: "${focusInstruction.trim()}"`
      : "";

  return [
    { role: "system", content: COMPACT_SYSTEM_PROMPT },
    { role: "user", content: `Conversation transcript to compact:\n\n${transcript}${focusNote}` },
  ];
}

export interface CompactStats {
  beforeMessages: number;
  beforeTokens: number;
  afterTokens: number;
}

export function formatCompactedMessage(summaryText: string, stats: CompactStats): string {
  const saved = Math.max(0, stats.beforeTokens - stats.afterTokens);
  const savedPct = stats.beforeTokens > 0 ? Math.round((saved / stats.beforeTokens) * 100) : 0;

  return [
    `[CONTEXT COMPACTED] (/compact)`,
    ``,
    summaryText.trim() || "(empty summary)",
    ``,
    `---`,
    `*Compacted ${stats.beforeMessages} messages (~${stats.beforeTokens.toLocaleString()} tokens) -> ~${stats.afterTokens.toLocaleString()} tokens (saved ~${savedPct}%). Conversation continues from this summary.*`,
  ].join("\n");
}
