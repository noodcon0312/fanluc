import { ApiConfig, TestResult } from "../types";

export function isNgrokUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes("ngrok") || lower.includes("ngrok-free");
}

// Ollama's default port (11434) is a reliable signal even if the host isn't
// literally "ollama" (e.g. a tunneled or renamed address still hits :11434).
export function isOllamaUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes("ollama") || lower.includes(":11434");
}

// Ollama has no "default model" the way a single-model local server does --
// every model must be pulled first under an EXACT tag (`ollama pull llama3.1`,
// `ollama list` to see what's available). Silently falling back to some other
// provider's default model name (see below) sends a request for a model that
// was never pulled, which Ollama rejects with a generic "model not found"
// error that gives no hint the real problem is just an empty Model Name field.
function requireModelForOllama(config: ApiConfig): void {
  if (isOllamaUrl(config.apiUrl) && !(config.model && config.model.trim())) {
    throw new Error(
      "Ollama needs the exact model name you pulled (see `ollama list`), e.g. \"llama3.1\" or \"smollm:135m\" " +
        "-- fill in Model Name in API settings before sending."
    );
  }
}

// ---------- 1) TEXT ONLY REQUEST ----------
export async function askGemmaText(
  prompt: string,
  apiUrl: string,
  apiKey: string,
  options: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    repeatPenalty?: number;
    reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
  } = {}
): Promise<string> {
  const {
    maxTokens = 512,
    temperature = 1.0,          // recommended thinking mode
    topP = 0.95,                 // recommended thinking mode
    topK = 20,                    // recommended thinking mode
    repeatPenalty = 1.05,         // slight penalty
    reasoningEffort = "medium",  // "none"/"low"/"medium"/"high"/"xhigh"
  } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: [
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: temperature,
      top_p: topP,
      top_k: topK,
      repeat_penalty: repeatPenalty,
      enable_thinking: true,
      reasoning_effort: reasoningEffort,
      tool_choice: "none",   // disable tool calling
    }),
  });

  if (!response.ok) {
    throw new Error(`Server error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ---------- 2) GỬI TEXT + ẢNH ----------
export async function askGemmaWithImage(
  imageFile: File | Blob | string,
  prompt: string,
  apiUrl: string,
  apiKey: string,
  options: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    repeatPenalty?: number;
    reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
  } = {}
): Promise<string> {
  const {
    maxTokens = 512,
    temperature = 1.0,         
    topP = 0.95,              
    topK = 20,                    
    repeatPenalty = 1.05,        
    reasoningEffort = "medium",  // "none"/"low"/"medium"/"high"/"xhigh"
  } = options;

  let base64Image: string;
  if (typeof imageFile === "string") {
    base64Image = imageFile;
  } else {
    const toBase64 = (file: File | Blob): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string); // includes data:image/...;base64 prefix
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    base64Image = await toBase64(imageFile);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: base64Image } },
          ],
        },
      ],
      max_tokens: maxTokens,
      temperature: temperature,
      top_p: topP,
      top_k: topK,
      repeat_penalty: repeatPenalty,
      enable_thinking: true,
      reasoning_effort: reasoningEffort,
      tool_choice: "none",   // disable tool/function calling
    }),
  });

  if (!response.ok) {
    throw new Error(`Server error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

export async function sendChatMessage(
  messages: { role: string; content: string | any[] }[],
  config: ApiConfig,
  onUpdate?: (content: string) => void,
  signal?: AbortSignal
): Promise<string> {
  requireModelForOllama(config);
  const isNgrok = isNgrokUrl(config.apiUrl);

  let payload: any;
  if (isNgrok) {
    // Ngrok payload with user config (X, Y, Z, top_k, repeat_penalty, reasoning_effort, enable_thinking, tool_choice)
    payload = {
      messages,
      max_tokens: config.maxTokens !== undefined ? config.maxTokens : 512,
      temperature: config.temperature !== undefined ? config.temperature : 1.0,
      top_p: config.topP !== undefined ? config.topP : 0.95,
      top_k: config.topK !== undefined ? config.topK : 20,
      repeat_penalty: config.repeatPenalty !== undefined ? config.repeatPenalty : 1.05,
      enable_thinking: true,
      reasoning_effort: config.reasoningEffort || "medium",
      tool_choice: "none",
      stream: true,
    };
    if (config.model && config.model.trim()) {
      payload.model = config.model;
    }
  } else {
    // Standard OpenAI compatible format
    payload = {
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
      model: config.model || "Qwen3.5-4B",
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  };

  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  try {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP Error ${response.status}: ${errText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json") && !response.body) {
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content || "";
      if (onUpdate) onUpdate(content);
      return content;
    }

    if (!response.body) {
      throw new Error("No response body for stream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.replace(/^data:\s*/, "").trim();
        if (trimmed === "[DONE]") return fullContent;
        if (!trimmed) continue;
        try {
          const json = JSON.parse(trimmed);
          const token = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content;
          if (token) {
            fullContent += token;
            if (onUpdate) onUpdate(fullContent);
          }
        } catch (e) {
          // ignore parse error
        }
      }
    }

    // In case response was a non-SSE standard JSON returned through body
    if (!fullContent && buffer.trim()) {
      try {
        const json = JSON.parse(buffer.trim());
        const token = json.choices?.[0]?.message?.content || json.choices?.[0]?.delta?.content;
        if (token) {
          fullContent = token;
          if (onUpdate) onUpdate(fullContent);
        }
      } catch {
        // ignore
      }
    }

    return fullContent;
  } catch (directError: any) {
    if (directError.name === 'AbortError') {
      throw directError;
    }
    console.warn("Direct request failed, retrying via Proxy Server...", directError);
    // Fallback to server proxy if CORS or network error occurs
    try {
      return await sendViaProxy(config, payload, onUpdate, signal);
    } catch (proxyError: any) {
      if (proxyError.name === 'AbortError') {
        throw proxyError;
      }
      throw new Error(`Connection Error (Direct & Proxy): ${directError.message || proxyError.message}`);
    }
  }
}

async function sendViaProxy(config: ApiConfig, payload: any, onUpdate?: (content: string) => void, signal?: AbortSignal): Promise<string> {
  const response = await fetch("/api/proxy-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      body: payload,
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Proxy HTTP Error ${response.status}: ${errText}`);
  }

  // Handle stream from proxy
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body from proxy stream");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.replace(/^data:\s*/, "").trim();
      if (trimmed === "[DONE]") return fullContent;
      if (!trimmed) continue;
      try {
        const json = JSON.parse(trimmed);
        const token = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content;
        if (token) {
          fullContent += token;
          if (onUpdate) onUpdate(fullContent);
        }
      } catch (e) {
        // ignore parse error
      }
    }
  }
  return fullContent;
}

export async function testApiConnection(config: ApiConfig): Promise<TestResult> {
  const startTime = Date.now();
  try {
    requireModelForOllama(config);
  } catch (e: any) {
    return { success: false, error: e.message, latencyMs: Date.now() - startTime };
  }
  const isNgrok = isNgrokUrl(config.apiUrl);

  let testPayload: any;
  if (isNgrok) {
    testPayload = {
      messages: [
        { role: "user", content: "Hello! Are you online and receiving my messages?" },
      ],
      max_tokens: config.maxTokens || 512,
      temperature: config.temperature !== undefined ? config.temperature : 1.0,
      top_p: config.topP !== undefined ? config.topP : 0.95,
      top_k: config.topK !== undefined ? config.topK : 20,
      repeat_penalty: config.repeatPenalty !== undefined ? config.repeatPenalty : 1.05,
      enable_thinking: true,
      reasoning_effort: config.reasoningEffort || "medium",
      tool_choice: "none",
    };
    if (config.model && config.model.trim()) {
      testPayload.model = config.model;
    }
  } else {
    testPayload = {
      messages: [
        { role: "system", content: "You are a helpful AI assistant." },
        { role: "user", content: "Hello! Are you online and receiving my messages?" },
      ],
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens || 500,
      model: config.model || "Qwen3.5-4B",
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  };

  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  try {
    // Try direct fetch first
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(testPayload),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errText = await response.text();
      // Try proxy fallback
      try {
        const proxyResult = await testViaProxy(config, testPayload, startTime);
        return proxyResult;
      } catch {
        return {
          success: false,
          status: response.status,
          responseText: errText,
          error: `HTTP Error ${response.status}: ${errText}`,
          latencyMs,
        };
      }
    }

    const data = await response.json();
    const aiReply = data?.choices?.[0]?.message?.content || JSON.stringify(data);

    return {
      success: true,
      status: response.status,
      responseText: JSON.stringify(data, null, 2),
      aiReply,
      latencyMs,
    };
  } catch (error: any) {
    // Try via proxy as fallback
    try {
      return await testViaProxy(config, testPayload, startTime);
    } catch (proxyError: any) {
      return {
        success: false,
        error: error?.message || proxyError?.message || "Could not connect to API URL",
        latencyMs: Date.now() - startTime,
      };
    }
  }
}

async function testViaProxy(config: ApiConfig, payload: any, startTime: number): Promise<TestResult> {
  const response = await fetch("/api/proxy-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      body: payload,
    }),
  });

  const latencyMs = Date.now() - startTime;
  if (!response.ok) {
    const errText = await response.text();
    return {
      success: false,
      status: response.status,
      responseText: errText,
      error: `Proxy Error (${response.status}): ${errText}`,
      latencyMs,
    };
  }

  const data = await response.json();
  const aiReply = data?.choices?.[0]?.message?.content || JSON.stringify(data);

  return {
    success: true,
    status: response.status,
    responseText: JSON.stringify(data, null, 2),
    aiReply,
    latencyMs,
  };
}
