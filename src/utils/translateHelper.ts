import { TranslationCardData } from "../types";
import { parseThinkContent } from "./parseThink";

export interface TranslateCommand {
  text: string;
  to: string;
  from?: string;
  title?: string;
  rawCall?: string;
}

/**
 * Regex for matching translate(...) calls
 */
// Only a REAL tool call: `translate(` must not be glued to another identifier
// (so CSS `transform: translate(-50%, -50%)`, `.translate(...)`, `x-translate(` are ignored)
// and its first argument must be a quoted string or `text=` (CSS/JS args like -50%, 0, 10px never match).
export const TRANSLATE_REGEX =
  /(?:```[a-z]*\s*)?(?:call:)?(?<![\w.$-])translate\s*\(\s*(?=["'`]|text\s*=)([\s\S]*?)\s*\)(?:\s*```)?/gi;

/**
 * Helper to deduplicate translation cards by normalized content
 */
export function deduplicateTranslationCards(cards: TranslationCardData[]): TranslationCardData[] {
  if (!Array.isArray(cards) || cards.length === 0) return [];
  const seen = new Set<string>();
  const uniqueCards: TranslationCardData[] = [];

  for (const card of cards) {
    if (!card || (!card.originalText && !card.translatedText)) continue;
    const normOriginal = (card.originalText || "").trim().toLowerCase();
    const normTo = (card.toLang || "").trim().toLowerCase();
    const normFrom = (card.fromLang || "").trim().toLowerCase();
    const key = `${normOriginal}|${normTo}|${normFrom}`;

    if (!seen.has(key)) {
      seen.add(key);
      uniqueCards.push(card);
    }
  }

  return uniqueCards;
}

/**
 * Helper to extract balanced or parsed arguments from translate(...)
 * Strips think/reasoning blocks so instructions inside <think> are never executed.
 */
export function extractTranslateCommands(
  text: string,
  thinkStartTag?: string,
  thinkEndTag?: string
): TranslateCommand[] {
  if (!text || typeof text !== "string") return [];
  const thinkParsed = parseThinkContent(text, thinkStartTag, thinkEndTag);
  const targetText = thinkParsed.mainText;
  if (!targetText) return [];

  const results: TranslateCommand[] = [];
  const seen = new Set<string>();
  const regex = new RegExp(TRANSLATE_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(targetText)) !== null) {
    try {
      const rawArgs = match[1].trim();
      let textArg = "";
      let toArg = "en";
      let fromArg = "auto";
      let titleArg: string | undefined;

      // Check for named parameters: text="...", to="...", from="...", title="..."
      const textParamMatch = rawArgs.match(/(?:^|,\s*)text\s*=\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`)/i);
      const toParamMatch = rawArgs.match(/(?:^|,\s*)(?:to|target)\s*=\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`|([a-zA-Z_-]+))/i);
      const fromParamMatch = rawArgs.match(/(?:^|,\s*)(?:from|source)\s*=\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`|([a-zA-Z_-]+))/i);
      const titleParamMatch = rawArgs.match(/(?:^|,\s*)title\s*=\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`)/i);

      if (textParamMatch) {
        textArg = (textParamMatch[1] || textParamMatch[2] || textParamMatch[3] || "").replace(/\\"/g, '"').replace(/\\'/g, "'");
      }
      if (toParamMatch) {
        toArg = (toParamMatch[1] || toParamMatch[2] || toParamMatch[3] || toParamMatch[4] || "en").trim();
      }
      if (fromParamMatch) {
        fromArg = (fromParamMatch[1] || fromParamMatch[2] || fromParamMatch[3] || fromParamMatch[4] || "auto").trim();
      }
      if (titleParamMatch) {
        titleArg = (titleParamMatch[1] || titleParamMatch[2] || titleParamMatch[3] || "").replace(/\\"/g, '"').replace(/\\'/g, "'").trim();
      }

      // Fallback to positional arguments: translate("text to translate", "vi", "en")
      if (!textArg) {
        const quotedArgs = [...rawArgs.matchAll(/(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`)/g)];
        if (quotedArgs.length >= 1) {
          textArg = (quotedArgs[0][1] || quotedArgs[0][2] || quotedArgs[0][3] || "").replace(/\\"/g, '"').replace(/\\'/g, "'");
          if (quotedArgs.length >= 2) {
            toArg = (quotedArgs[1][1] || quotedArgs[1][2] || quotedArgs[1][3] || "en").trim();
          }
          if (quotedArgs.length >= 3) {
            fromArg = (quotedArgs[2][1] || quotedArgs[2][2] || quotedArgs[2][3] || "auto").trim();
          }
        } else {
          // If no quotes, raw string
          const parts = rawArgs.split(",").map((p) => p.trim());
          if (parts[0]) textArg = parts[0];
          if (parts[1]) toArg = parts[1];
          if (parts[2]) fromArg = parts[2];
        }
      }

      if (textArg) {
        const key = `${textArg.trim().toLowerCase()}|${(toArg || "en").toLowerCase()}|${(fromArg || "auto").toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            text: textArg,
            to: toArg || "en",
            from: fromArg || "auto",
            title: titleArg,
            rawCall: match[0],
          });
        }
      }
    } catch (err) {
      console.warn("Failed to parse translate command:", err);
    }
  }

  return results;
}

/**
 * Strip translate(...) commands from visible message text
 */
export function stripTranslateCommands(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(new RegExp(TRANSLATE_REGEX.source, "gi"), "")
    .replace(/`\s*(?:call:)?(?<![\w.$-])translate\s*\(\s*(?=["'`]|text\s*=)[\s\S]*?\)\s*`/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Perform translation by calling backend API /api/translate
 */
export async function performTranslate(cmd: TranslateCommand): Promise<TranslationCardData> {
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: cmd.text,
        to: cmd.to || "en",
        from: cmd.from || "auto",
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        id: `trans-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        originalText: cmd.text,
        translatedText: "",
        fromLang: cmd.from || "auto",
        toLang: cmd.to || "en",
        title: cmd.title,
        error: errData.error || `HTTP error ${res.status}`,
      };
    }

    const data = await res.json();
    return {
      id: `trans-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      originalText: cmd.text,
      translatedText: data.translatedText || "",
      fromLang: data.detectedFrom || cmd.from || "auto",
      toLang: cmd.to || "en",
      title: cmd.title,
      error: data.error,
    };
  } catch (err: any) {
    return {
      id: `trans-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      originalText: cmd.text,
      translatedText: "",
      fromLang: cmd.from || "auto",
      toLang: cmd.to || "en",
      title: cmd.title,
      error: err?.message || "Failed to communicate with translation service",
    };
  }
}
