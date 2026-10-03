export interface ParsedMessageContent {
  hasThought: boolean;
  isThinking: boolean;
  thoughtText: string;
  thoughts: string[];
  mainText: string;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function cleanThoughtLines(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  const filtered = lines.filter((line) => {
    const lower = line.toLowerCase();
    if (
      lower.includes("system instruction") ||
      lower.includes("system instructions") ||
      lower.includes("system prompt") ||
      lower.includes("system prompts") ||
      lower.includes("system_instruction") ||
      lower.includes("system_prompt") ||
      lower.includes("systeminstruction") ||
      lower.includes("systemprompt")
    ) {
      return false;
    }
    return true;
  });
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseThinkContent(
  content: string,
  startTag: string = "<think>",
  endTag: string = "</think>"
): ParsedMessageContent {
  if (!content) {
    return {
      hasThought: false,
      isThinking: false,
      thoughtText: "",
      thoughts: [],
      mainText: "",
    };
  }

  const cleanStart = (startTag || "").trim() || "<think>";
  const cleanEnd = (endTag || "").trim() || "</think>";

  // List of all recognized think tag pairs (custom first, then standard formats)
  const tagPairs: { start: string; end: string }[] = [
    { start: cleanStart, end: cleanEnd },
    { start: "<think>", end: "</think>" },
    { start: "<thought>", end: "</thought>" },
    { start: "<reasoning>", end: "</reasoning>" },
    { start: "<antThinking>", end: "</antThinking>" },
    { start: "[THINK]", end: "[/THINK]" },
    { start: "[REASONING]", end: "[/REASONING]" },
    { start: `<details type="reasoning">`, end: "</details>" },
  ];

  // Unique pairs by lowercase start
  const uniquePairs = tagPairs.filter(
    (p, idx, arr) => arr.findIndex((x) => x.start.toLowerCase() === p.start.toLowerCase()) === idx
  );

  let currentText = content;
  const thoughts: string[] = [];
  let isThinking = false;

  for (const pair of uniquePairs) {
    const pattern = `${escapeRegex(pair.start)}([\\s\\S]*?)(?:${escapeRegex(pair.end)}|$)`;
    const regex = new RegExp(pattern, "gi");
    let match: RegExpExecArray | null;
    let newMainText = "";
    let lastIndex = 0;

    while ((match = regex.exec(currentText)) !== null) {
      newMainText += currentText.substring(lastIndex, match.index);
      const rawPiece = match[1].trim();
      const cleanedPiece = cleanThoughtLines(rawPiece);
      if (cleanedPiece) {
        thoughts.push(cleanedPiece);
      }
      lastIndex = regex.lastIndex;

      // If the match does not end with the end tag, thinking is ongoing
      if (!match[0].toLowerCase().endsWith(pair.end.toLowerCase())) {
        isThinking = true;
      }
    }

    newMainText += currentText.substring(lastIndex);
    currentText = newMainText;
  }

  // Final cleanup of standalone backticks that might have been left behind when thoughts were removed
  // If the thought block ended, and left behind some trailing backticks at the beginning of the new string
  currentText = currentText.replace(/^\s*`+\s*\n?/g, '').replace(/\n?\s*`+\s*$/g, '');
  currentText = currentText.trim();
  
  if (currentText.startsWith('"') && currentText.endsWith('"') && currentText.length === 2) {
      currentText = "";
  }
  
  if (currentText.startsWith("'") && currentText.endsWith("'") && currentText.length === 2) {
      currentText = "";
  }

  return {
    hasThought: thoughts.length > 0,
    isThinking,
    thoughtText: thoughts.join("\n\n").trim(),
    thoughts,
    mainText: currentText.trim(),
  };
}

