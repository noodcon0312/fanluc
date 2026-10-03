export interface ApiProviderPreset {
  id: string;
  name: string;
  url: string;
}

/**
 * Quick-select presets for common OpenAI-compatible chat completion endpoints.
 * Selecting one just fills the API URL field — the user still supplies their
 * own API key and model name for that provider.
 */
export const API_PROVIDER_PRESETS: ApiProviderPreset[] = [
  {
    id: "openai",
    name: "OPENAI",
    url: "https://api.openai.com/v1/chat/completions",
  },
  {
    id: "gemini",
    name: "GEMINI",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  },
  {
    id: "openrouter",
    name: "OPENROUTER",
    url: "https://openrouter.ai/api/v1/chat/completions",
  },
  {
    id: "groq",
    name: "GROQ",
    url: "https://api.groq.com/openai/v1/chat/completions",
  },
  {
    // Ollama's own OpenAI-compatible endpoint (v0.32+). Works with a blank
    // API key -- Ollama doesn't check it. Use the exact local model name
    // (e.g. "llama3.1", "qwen2.5:7b") as pulled with `ollama pull`.
    // If Ollama runs on another machine, replace "localhost" with its
    // address (and make sure OLLAMA_HOST allows remote connections).
    id: "ollama",
    name: "OLLAMA",
    url: "http://localhost:11434/v1/chat/completions",
  },
];
