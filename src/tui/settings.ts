export type FieldType = "text" | "secret" | "number" | "enum" | "bool";
export type FieldScope = "config" | "permission" | "searx" | "settings";

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  scope: FieldScope;
  options?: string[];
  min?: number;
  max?: number;
  restart?: boolean;
  hint: string;
}

export interface TuiConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
  reasoningEffort: string;
  effort: string;
  thinkStartTag: string;
  thinkEndTag: string;
  stripOpenTags?: string;
  stripCloseTags?: string;
  useProxy?: boolean;
  [key: string]: unknown;
}

export const DEFAULT_CONFIG: TuiConfig = {
  apiUrl: "",
  apiKey: "none",
  model: "",
  systemPrompt: "",
  temperature: 0.7,
  maxTokens: 8000,
  topP: 0.95,
  topK: 40,
  repeatPenalty: 1.01,
  reasoningEffort: "high",
  effort: "fast",
  thinkStartTag: "<think>",
  thinkEndTag: "</think>",
};

export const FIELDS: Field[] = [
  { key: "apiUrl", label: "API URL", type: "text", scope: "config", hint: "e.g. http://127.0.0.1:8080/v1/chat/completions" },
  { key: "apiKey", label: "API key", type: "secret", scope: "config", hint: "Bearer token sent with every request" },
  { key: "model", label: "Model", type: "text", scope: "config", hint: "Model name served (see /model for the list)" },
  { key: "effort", label: "Effort (prompt)", type: "enum", scope: "config", options: ["fast", "cautious", "thorough", "meticulous", "omni"], hint: "fast = short prompt, meticulous = full tool protocol" },
  { key: "reasoningEffort", label: "Reasoning effort", type: "enum", scope: "config", options: ["none", "low", "medium", "high", "xhigh"], hint: "Sent to the server as reasoning_effort" },
  { key: "temperature", label: "Temperature", type: "number", scope: "config", min: 0, max: 2, hint: "0 = stable, 1+ = creative" },
  { key: "maxTokens", label: "Max tokens", type: "number", scope: "config", min: 1, max: 1000000, hint: "Max reply length" },
  { key: "topP", label: "Top P", type: "number", scope: "config", min: 0, max: 1, hint: "Nucleus sampling" },
  { key: "topK", label: "Top K", type: "number", scope: "config", min: 0, max: 100000, hint: "0 = off (server default)" },
  { key: "repeatPenalty", label: "Repeat penalty", type: "number", scope: "config", min: 0, max: 5, hint: "1.0 = no repeat penalty" },
  { key: "useProxy", label: "Use proxy server", type: "bool", scope: "config", hint: "Call the API via the local server instead of direct" },
  { key: "thinkStartTag", label: "Think open", type: "text", scope: "config", hint: "Opening tag of the model thinking block" },
  { key: "thinkEndTag", label: "Think close", type: "text", scope: "config", hint: "Closing tag of the model thinking block" },
  { key: "stripOpenTags", label: "Strip open tags", type: "text", scope: "config", hint: "Opening tags to remove from replies" },
  { key: "stripCloseTags", label: "Strip close tags", type: "text", scope: "config", hint: "Closing tags to remove from replies" },
  { key: "systemPrompt", label: "System prompt", type: "text", scope: "config", hint: "Added to the base prompt (keep short for small models)" },
  { key: "permission", label: "Permission", type: "enum", scope: "permission", options: ["ask", "autoEdit", "readOnly"], hint: "ask: confirm every time | autoEdit: auto file writes | readOnly: read only (Shift+Tab cycles fast)" },
  { key: "searxngUrl", label: "SearXNG URL", type: "text", scope: "searx", hint: "Empty = use built-in search engines" },
  { key: "port", label: "Port", type: "number", scope: "settings", min: 1, max: 65535, restart: true, hint: "Restart fanluc to apply" },
  { key: "host", label: "Host", type: "text", scope: "settings", restart: true, hint: "127.0.0.1 = this machine only. Restart to apply" },
];

export function mask(v: unknown): string {
  const s = String(v ?? "");
  if (!s) return "(empty)";
  return s.length <= 6 ? "***" : `${s.slice(0, 3)}…${s.slice(-2)}`;
}

export function show(f: Field, v: unknown): string {
  if (f.type === "secret") return mask(v);
  if (f.type === "bool") return v ? "on" : "off";
  const s = v === undefined || v === null || v === "" ? "(empty)" : String(v);
  return s.length > 44 ? s.slice(0, 43) + "…" : s;
}

export function parseValue(f: Field, raw: string): { ok: boolean; value?: unknown; error?: string } {
  if (f.type === "number") {
    const n = Number(raw);
    if (!raw.trim() || !Number.isFinite(n)) return { ok: false, error: `${f.label} must be a number` };
    if (f.min !== undefined && n < f.min) return { ok: false, error: `${f.label} must be >= ${f.min}` };
    if (f.max !== undefined && n > f.max) return { ok: false, error: `${f.label} must be <= ${f.max}` };
    return { ok: true, value: n };
  }
  if (f.type === "enum") {
    return (f.options ?? []).includes(raw)
      ? { ok: true, value: raw }
      : { ok: false, error: `${f.label}: pick ${(f.options ?? []).join(" | ")}` };
  }
  if (f.type === "bool") {
    if (/^(1|true|on|yes)$/i.test(raw)) return { ok: true, value: true };
    if (/^(0|false|off|no)$/i.test(raw)) return { ok: true, value: false };
    return { ok: false, error: `${f.label}: on | off` };
  }
  if ((f.key === "apiUrl" || f.key === "searxngUrl") && raw.trim() && !/^https?:\/\//i.test(raw.trim())) {
    return { ok: false, error: `${f.label} must start with http:// or https://` };
  }
  return { ok: true, value: raw.trim() };
}
