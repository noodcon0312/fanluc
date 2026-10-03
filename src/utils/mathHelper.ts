// Math helper to sanitize and format math expressions $ ... $ and $$ ... $$
export function formatMathInText(text: string): string {
  if (!text) return "";
  let result = text;
  // Convert LaTeX brackets \( ... \) -> $ ... $ and \[ ... \] -> $$ ... $$
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n$$\n${math.trim()}\n$$\n`);
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math.trim()}$`);
  
  // Clean single dollar math expressions with spaces like $ x = 1 $ -> $x = 1$
  result = result.replace(/(^|[^$\\])\$\s+([^$\n]+?)\s+\$([^$\\]|$)/g, '$1$$2$$3');
  return result;
}
