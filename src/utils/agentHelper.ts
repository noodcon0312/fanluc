import { AgentConfig, ApiConfig, ChatMessage, ReasoningEffort } from "../types";
import { sendChatMessage } from "./api";
import { executeRunCmd, parseRunCmdCommands } from "./codeRunner";
import { extractAllSearchCommands, extractAllFetchCommands, performYahooSearch, performFetchUrl } from "./yahooSearch";
import { getEffortPrompt } from "../prompts";

export function newAgentConfig(partial: Partial<AgentConfig> = {}): AgentConfig {
  const now = Date.now();
  return {
    id: partial.id || `agent_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: partial.name || "",
    description: partial.description || "",
    apiUrl: partial.apiUrl || "",
    apiKey: partial.apiKey || "",
    model: partial.model || "",
    temperature: partial.temperature ?? 0.7,
    maxTokens: partial.maxTokens ?? 2000,
    topP: partial.topP,
    topK: partial.topK,
    repeatPenalty: partial.repeatPenalty,
    reasoningEffort: partial.reasoningEffort as ReasoningEffort | undefined,
    effort: partial.effort || "fast",
    tag: partial.tag || "text",
    createdAt: partial.createdAt || now,
    updatedAt: now,
  };
}

/** Folder name under workspace/agents/ for this agent -- based on its NAME (what the main AI knows from list_agent), not its internal id. */
export function agentWorkspaceFolder(agent: AgentConfig): string {
  const safe = (agent.name || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe || agent.id;
}

function agentToApiConfig(agent: AgentConfig): ApiConfig {
  return {
    apiUrl: agent.apiUrl,
    apiKey: agent.apiKey,
    model: agent.model,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    topP: agent.topP,
    topK: agent.topK,
    repeatPenalty: agent.repeatPenalty,
    reasoningEffort: agent.reasoningEffort,
  } as ApiConfig;
}

/** A short one-off prompt used right after creating/editing an agent, to confirm the connection actually works before relying on it. */
export async function testAgent(agent: AgentConfig): Promise<{ ok: boolean; text: string }> {
  try {
    const reply = await sendChatMessage(
      [{ role: "user", content: "Reply with a short one-sentence hello so I know you're connected." }],
      agentToApiConfig(agent)
    );
    return { ok: true, text: reply.slice(0, 500) };
  } catch (e: any) {
    return { ok: false, text: e?.message || String(e) };
  }
}

// ------------------------------------------------------------ sub-agent loop
// Scoped on purpose: only run_cmd (in the agent's OWN workspace subfolder),
// search, and fetch are actually executed. Sub-agents don't get list_agent /
// prompt_agent / view_image_agent themselves, so this can't recurse.
const MAX_SUBAGENT_STEPS = 5;

function stripLeftoverCommandSyntax(text: string): string {
  return text
    .replace(/\brun_cmd\s*\{[\s\S]*?\}/gi, "")
    .replace(/\bsearch\s*\([^)]*\)(?:\s*\(\s*\d+\s*\))?/gi, "")
    .replace(/\bfetch\s*\([^)]*\)(?:\s*\(\s*\d+\s*\))?/gi, "")
    .trim();
}

/** Runs a bounded agentic loop against the sub-agent's own API/model, returning its final text answer. */
export async function runSubAgent(agent: AgentConfig, prompt: string, signal?: AbortSignal): Promise<string> {
  const systemPrompt =
    `You are a sub-agent named "${agent.name}", delegated a task by a main assistant.` +
    (agent.description ? ` Your role: ${agent.description}` : "") +
    `\n\nFor this task, of everything described below, only run_cmd{...}, search(...), and fetch(...) will ` +
    `actually be executed for you -- ignore every other command mentioned, they will not run here. Files you ` +
    `create with run_cmd stay in your own separate workspace. Give a complete, self-contained final answer as ` +
    `plain text (no other tool syntax) once you're done -- the main assistant only sees your final text, not ` +
    `your intermediate steps.\n\n` +
    getEffortPrompt(agent.effort);

  const apiConfig = agentToApiConfig(agent);
  const payload: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  for (let step = 0; step < MAX_SUBAGENT_STEPS; step++) {
    const response = await sendChatMessage(payload, apiConfig, undefined, signal);
    const runCmds = parseRunCmdCommands(response);
    const searchCmds = extractAllSearchCommands(response);
    const fetchCmds = extractAllFetchCommands(response);

    if (runCmds.length === 0 && searchCmds.length === 0 && fetchCmds.length === 0) {
      return stripLeftoverCommandSyntax(response) || "(the agent returned an empty response)";
    }

    const outputs: string[] = [];
    for (const cmd of runCmds) outputs.push(await executeRunCmd(cmd.code, 120000, agentWorkspaceFolder(agent)));
    for (const cmd of searchCmds) outputs.push(await performYahooSearch(cmd.query, cmd.count));
    for (const cmd of fetchCmds) outputs.push(await performFetchUrl(cmd.url, cmd.length));

    payload.push({ role: "assistant", content: response });
    payload.push({ role: "user", content: outputs.join("\n\n") || "(no output)" });
  }

  const lastAssistant = [...payload].reverse().find((m) => m.role === "assistant");
  return `(agent "${agent.name}" did not finish within ${MAX_SUBAGENT_STEPS} steps -- its last message was:)\n${
    stripLeftoverCommandSyntax(lastAssistant?.content || "")
  }`;
}

// -------------------------------------------------------- command parsing --

function findMatchingParen(text: string, openIdx: number): number {
  let depth = 1;
  let i = openIdx + 1;
  let inString: string | null = null;
  while (i < text.length && depth > 0) {
    const c = text[i];
    if (inString) {
      if (c === "\\" && i + 1 < text.length) {
        i += 2;
        continue;
      }
      if (c === inString) inString = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c;
      i++;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

function unquote(s: string): string {
  return s.trim().replace(/^["'`]/, "").replace(/["'`]$/, "").trim();
}

export interface ParsedPromptAgent {
  fullMatch: string;
  agentName: string;
  prompt: string;
}

/** prompt_agent(name)(the actual prompt) -- two paren groups back to back. */
export function parsePromptAgentCommands(text: string): ParsedPromptAgent[] {
  if (!text || typeof text !== "string") return [];
  const results: ParsedPromptAgent[] = [];
  const re = /\bprompt_agent\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const open1 = m.index + m[0].length - 1;
    const close1 = findMatchingParen(text, open1);
    if (close1 === -1) break;
    let j = close1 + 1;
    while (j < text.length && /\s/.test(text[j])) j++;
    if (text[j] !== "(") {
      re.lastIndex = close1 + 1;
      continue;
    }
    const close2 = findMatchingParen(text, j);
    if (close2 === -1) break;
    results.push({
      fullMatch: text.slice(m.index, close2 + 1),
      agentName: unquote(text.slice(open1 + 1, close1)),
      prompt: unquote(text.slice(j + 1, close2)),
    });
    re.lastIndex = close2 + 1;
  }
  return results;
}

export function stripPromptAgentCommands(text: string): string {
  if (!text || typeof text !== "string") return "";
  let cleaned = text;
  for (const cmd of parsePromptAgentCommands(cleaned)) cleaned = cleaned.replace(cmd.fullMatch, "");
  return cleaned.trim();
}

function parseSimpleAgentCall(text: string, name: string): { fullMatch: string; arg: string }[] {
  if (!text || typeof text !== "string") return [];
  const results: { fullMatch: string; arg: string }[] = [];
  const re = new RegExp(`\\b${name}\\s*\\(\\s*([^)]*)\\)`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push({ fullMatch: m[0], arg: unquote(m[1]) });
  }
  return results;
}

export function parseListAgentCommands(text: string) {
  return parseSimpleAgentCall(text, "list_agent");
}
export function stripListAgentCommands(text: string): string {
  if (!text) return "";
  let cleaned = text;
  for (const c of parseListAgentCommands(cleaned)) cleaned = cleaned.replace(c.fullMatch, "");
  return cleaned.trim();
}
export function parseViewImageAgentCommands(text: string) {
  return parseSimpleAgentCall(text, "view_image_agent");
}
export function stripViewImageAgentCommands(text: string): string {
  if (!text) return "";
  let cleaned = text;
  for (const c of parseViewImageAgentCommands(cleaned)) cleaned = cleaned.replace(c.fullMatch, "");
  return cleaned.trim();
}

// ------------------------------------------------------------ list_agent ----

export function executeListAgent(agents: AgentConfig[]): string {
  if (agents.length === 0) return "No agents configured yet.";
  return agents
    .map((a, i) => {
      const tagNote = a.tag === "image" ? " (for view_image_agent only)" : "";
      return `${i + 1}) name: ${a.name}${tagNote}\n   description: ${a.description || "(no description)"}`;
    })
    .join("\n");
}

/** Scans messages newest-first for the last image attachment (what view_image_agent sends). */
export function findMostRecentImageAttachment(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const att = messages[i].attachment;
    if (att && att.type === "image" && att.dataUrl) return att.dataUrl;
  }
  return null;
}

// ------------------------------------------------------- view_image_agent ---

/** Sends an image (as a data URL) to a named image-tagged agent for analysis. */
export async function executeViewImageAgent(agent: AgentConfig, imageDataUrl: string): Promise<string> {
  try {
    const reply = await sendChatMessage(
      [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image in useful detail for the assistant that is asking you." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ] as any,
        },
      ],
      agentToApiConfig(agent)
    );
    return reply;
  } catch (e: any) {
    return `Error calling agent "${agent.name}": ${e?.message || e}`;
  }
}

// -------------------------------------------------- system-prompt teaching --

export function getAgentToolsPrompt(agents: AgentConfig[]): string {
  const textAgents = agents.filter((a) => a.tag !== "image");
  const imageAgents = agents.filter((a) => a.tag === "image");
  return `

---

SUB-AGENTS

You have access to other AI agents the user has configured, each with its own model/API and a
description of what it's good for.

list_agent() -- lists every available agent with its name and description.

prompt_agent("agent name")("the prompt to send it") -- sends a prompt to a TEXT agent (tag:
text) and returns its final answer. It runs its own separate task in its own workspace; you only
see what it finally answers, not its intermediate steps. Use this to delegate a sub-task to a
specific agent when its description says it's a good fit -- e.g. a cheaper/faster agent for an
easy sub-task, or one described as good at something you are not.

If an agent's answer says it created file(s), those files are in YOUR OWN workspace too, under
<workspace>/.fanluc/agents/<agent name, lowercased, spaces to dashes>/ -- e.g. for an agent named "Note Writer",
run_cmd{ ls .fanluc/agents/note-writer } or run_cmd{ cat .fanluc/agents/note-writer/<file> } to read what it made.

view_image_agent("agent name") -- sends the most recently attached image in this conversation to
an IMAGE agent (tag: image) for it to describe/analyze, and returns what it says.

Only call these when the user's request, or your own plan, actually calls for a specialized
agent someone has set up (per its description) -- do not delegate routine work to a sub-agent
just because one exists.${
    textAgents.length || imageAgents.length
      ? `\n\nConfigured agents:\n${executeListAgent(agents)}`
      : "\n\n(No agents are configured yet -- list_agent() will confirm this.)"
  }`;
}
