export interface AskQuestion {
  question: string;
  options: string[];
}

export interface AskCommandData {
  fullMatch: string;
  questions: AskQuestion[];
}

export function parseAskCommand(text: string): AskCommandData | null {
  if (!text || typeof text !== "string") return null;

  // Supports standard quotes (" '), smart quotes (“ ” ‘ ’), and various dashes (- – — − ‐)
  // Search for ask("...")-sam(...) anywhere in the text
  const askRegex = /(?:```[a-z]*\s*|`\s*)?ask\s*\(\s*["'“”‘’]([^"'“”‘’\r\n]+)["'“”‘’]\s*\)\s*[-–—−‐]\s*sam\s*\(\s*([^)\r\n]+)\s*\)/gi;

  let match: RegExpExecArray | null = null;
  while ((match = askRegex.exec(text)) !== null) {
    const fullFirst = match[0];
    const firstQ = match[1].trim();
    const firstOptsRaw = match[2];

    const parseOptions = (raw: string): string[] => {
      return raw
        .split(",")
        .map((s) => s.trim().replace(/^["'“”‘’]|["'“”‘’]$/g, "").trim())
        .filter(Boolean);
    };

    const firstOptions = parseOptions(firstOptsRaw);
    if (firstOptions.length === 0) continue;

    const questions: AskQuestion[] = [
      {
        question: firstQ,
        options: firstOptions,
      },
    ];

    let remaining = text.slice(match.index + fullFirst.length);
    let fullMatchLength = fullFirst.length;

    // Follow-up questions: , ("Q2")-sam(opt1, opt2)
    const nextRegex = /^\s*,\s*\(\s*["'“”‘’]([^"'“”‘’\r\n]+)["'“”‘’]\s*\)\s*[-–—−‐]\s*sam\s*\(\s*([^)\r\n]+)\s*\)/i;
    while (questions.length < 5) {
      const nextMatch = remaining.match(nextRegex);
      if (!nextMatch) break;

      const opts = parseOptions(nextMatch[2]);
      if (opts.length > 0) {
        questions.push({
          question: nextMatch[1].trim(),
          options: opts,
        });
      }

      fullMatchLength += nextMatch[0].length;
      remaining = remaining.slice(nextMatch[0].length);
    }

    // Check if trailing backticks close the block
    const closingBackticks = remaining.match(/^\s*(?:```|`)/);
    if (closingBackticks) {
      fullMatchLength += closingBackticks[0].length;
    }

    const fullMatch = text.slice(match.index, match.index + fullMatchLength);
    return {
      fullMatch,
      questions,
    };
  }

  return null;
}

export function stripAskCommand(text: string): string {
  const parsed = parseAskCommand(text);
  if (!parsed) return text;
  return text.replace(parsed.fullMatch, "").trim();
}

