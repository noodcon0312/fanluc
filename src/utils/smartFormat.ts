// smartFormat — format beautifier: automatically format CSS / HTML / JS
// Issue: AI-generated single-line CSS/HTML like ".cell{...}.cell:hover{...}"
// Solution: detect and re-format before passing to ReactMarkdown.

export function beautifyCSS(css: string): string {
  // Insert newline after } ; and before next selector
  let out = css
    .replace(/\s*\{\s*/g, " {\n  ")
    .replace(/\s*;\s*/g, ";\n  ")
    .replace(/\s*\}\s*/g, "\n}\n")
    .replace(/,\s*/g, ", ")
    // Fix double newlines
    .replace(/\n\s*\n/g, "\n")
    .replace(/  \n\}/g, "\n}")
    .trim();
  // Ensure each top-level rule is separated by blank line
  out = out.replace(/\}\n(?=\.)/g, "}\n\n");
  return out;
}

export function beautifyHTML(html: string): string {
  // Insert newline between tags: "><" -> ">\n<"
  let out = html
    .replace(/>\s*</g, ">\n<")
    .replace(/><\//g, ">\n</")
    .trim();
  // Pretty-indent (very lightweight: 2 spaces per depth)
  const lines = out.split("\n");
  let depth = 0;
  const result: string[] = [];
  const voidTags = new Set(["br","hr","img","input","meta","link","area","base","col","embed","source","track","wbr"]);
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const isClosing = /^<\//.test(line);
    const tagMatch = line.match(/^<(\w+)/);
    const tag = tagMatch ? tagMatch[1].toLowerCase() : "";
    const isSelfClose = /\/>$/.test(line) || voidTags.has(tag);
    if (isClosing) depth = Math.max(0, depth - 1);
    result.push("  ".repeat(depth) + line);
    if (!isClosing && !isSelfClose && /^<[^!]/.test(line) && !line.includes("</")) {
      // heuristic: if line is opening tag without closing on same line, increase depth
      if (!line.endsWith("/>") && !line.includes("</")) depth++;
    }
  }
  return result.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function needsBeautify(text: string): boolean {
  if (!text || text.length < 80) return false;
  const lines = text.split("\n");
  // Single-line but long and contains CSS/HTML markers -> needs format
  if (lines.length <= 3 && text.length > 120) {
    if (/\{[^}]{20,}\}/.test(text) && /\.\w+\s*\{/.test(text)) return true; // CSS
    if (/<(div|span|button|style|html|head|body|h1|p)\b/i.test(text) && text.includes("><")) return true; // HTML collapsed
  }
  return false;
}

export function smartFormat(text: string): string {
  if (!text) return text;
  // Don't touch fenced code blocks — they are already formatted by the AI.
  // Only format bare CSS/HTML that leaked outside fences.
  const fenceRegex = /```[\s\S]*?```/g;
  const fences: string[] = [];
  let placeholder = text.replace(fenceRegex, (m) => {
    fences.push(m);
    return `__FENCE_${fences.length - 1}__`;
  });

  // Detect CSS-only or HTML-only bare blocks and beautify
  // CSS: contains multiple ".xxx{...}" but few newlines
  if (/\.\w+\s*\{[^}]*:[^}]*\}/.test(placeholder) && placeholder.split("\n").length < 5 && placeholder.length > 200) {
    // Extract potential CSS chunk (heuristic: from first ".xxx{" to last "}")
    const cssMatch = placeholder.match(/(\.[\s\S]*\})/);
    if (cssMatch && cssMatch[0].length > 100) {
      const beautified = beautifyCSS(cssMatch[0]);
      placeholder = placeholder.replace(cssMatch[0], beautified);
    }
  }

  // HTML collapsed:"><" pattern
  if (placeholder.includes("><") && /<(div|button|span|html|body)/i.test(placeholder)) {
    // Only beautify if really collapsed (few newlines)
    const beforeLines = placeholder.split("\n").length;
    if (beforeLines < 10) {
      placeholder = beautifyHTML(placeholder);
    }
  }

  // Restore fences
  placeholder = placeholder.replace(/__FENCE_(\d+)__/g, (_, idx) => fences[parseInt(idx, 10)]);

  // Final cleanup: ensure no 3+ consecutive blank lines, trim trailing spaces per line
  placeholder = placeholder
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return placeholder;
}

// Auto-wrap bare CSS/HTML in appropriate fences if not already fenced — improves markdown rendering
export function autoFenceIfNeeded(text: string): string {
  if (!text) return text;
  if (text.includes("```")) return text; // already has fences
  const trimmed = text.trim();
  // If entire segment is CSS (starts with . or # or @ and contains { ; })
  if (/^(\.|\#|@)[\w\-\s,:\.]+\s*\{/.test(trimmed) && trimmed.includes("}") && trimmed.includes(";")) {
    return "```css\n" + smartFormat(trimmed) + "\n```";
  }
  // If entire segment is HTML (starts with < and ends with >)
  if (trimmed.startsWith("<") && trimmed.endsWith(">") && /<\w+/.test(trimmed)) {
    return "```html\n" + smartFormat(trimmed) + "\n```";
  }
  return smartFormat(text);
}
