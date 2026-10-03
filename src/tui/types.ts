export type ToolStatus = "running" | "done" | "error";

export interface ToolRun {
  id: string;
  name: string;
  input: string;
  status: ToolStatus;
  output?: string;
}

export interface ThoughtRef {
  text: string;
  seconds: number;
  live?: boolean;
}

export type ChatEntry =
  | { id: string; kind: "user"; text: string }
  | {
      id: string;
      kind: "assistant";
      text: string;
      tools: ToolRun[];
      thought?: ThoughtRef;
      files?: string[];
      live?: boolean;
    }
  | { id: string; kind: "note"; text: string; level?: "error" | "warn" | "info" };

export interface ApiMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface SessionFile {
  id: string;
  title: string;
  workspace: string;
  createdAt: number;
  updatedAt: number;
  entries: ChatEntry[];
  messages: ApiMessage[];
}

export interface SessionMeta {
  id: string;
  title: string;
  updatedAt: number;
  workspace: string;
}

export type PanelState =
  | { type: "config"; sel: number; editing: boolean; buf: string; fresh?: boolean; msg?: string; ok?: boolean }
  | { type: "mcp"; sel: number; servers: McpServerInfo[]; loading: boolean }
  | { type: "list"; kind: "model" | "resume"; title: string; items: { label: string; value: string }[]; sel: number };

export interface McpServerInfo {
  name: string;
  type: string;
  status: "connected" | "failed" | "disabled" | "connecting";
  toolCount: number;
  error?: string | null;
}

export type PendingDecision = boolean | "auto";

export interface PendingState {
  /** "file" = local file-write confirm, "shell" = local shell confirm, "approval" = server permission queue */
  type: string;
  message: string;
  resolve: (d: PendingDecision) => void;
  at: number;
}

export interface CustomCommand {
  name: string;
  desc: string;
  body: string;
  source: string;
}

export interface BuiltinCommand {
  name: string;
  desc: string;
  args?: string;
  aliases?: string[];
}
