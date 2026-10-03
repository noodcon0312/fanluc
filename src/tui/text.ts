import stringWidth from "string-width";

export interface Seg {
  t: string;
  color?: "white" | "black";
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  bg?: "white" | "black";
}

const same = (a: Seg, b: Seg): boolean =>
  a.color === b.color && a.bold === b.bold && a.dim === b.dim && a.italic === b.italic && a.bg === b.bg;

export const w = (s: string): number => stringWidth(s);

export const lineWidth = (segs: Seg[]): number => segs.reduce((n, s) => n + stringWidth(s.t), 0);

export function hardWrap(text: string, width: number): string[] {
  width = Math.max(1, width);
  const out: string[] = [];
  let cur = "";
  let cw = 0;
  for (const ch of Array.from(text)) {
    const c = stringWidth(ch);
    if (cw + c > width) {
      out.push(cur);
      cur = "";
      cw = 0;
    }
    cur += ch;
    cw += c;
  }
  out.push(cur);
  return out;
}

export function wrapSegs(segs: Seg[], width: number): Seg[][] {
  width = Math.max(1, width);
  const lines: Seg[][] = [[]];
  let cw = 0;
  const push = (t: string, st: Seg) => {
    const cur = lines[lines.length - 1];
    const last = cur[cur.length - 1];
    if (last && same(last, st)) last.t += t;
    else cur.push({ ...st, t });
  };
  const newLine = () => {
    lines.push([]);
    cw = 0;
  };
  for (const seg of segs) {
    for (const tok of seg.t.split(/(\s+)/).filter((x) => x !== "")) {
      const tw = stringWidth(tok);
      if (/^\s+$/.test(tok)) {
        if (cw === 0) continue;
        if (cw + tw > width) {
          newLine();
          continue;
        }
        push(tok, seg);
        cw += tw;
        continue;
      }
      if (tw <= width - cw) {
        push(tok, seg);
        cw += tw;
        continue;
      }
      if (tw <= width) {
        newLine();
        push(tok, seg);
        cw = tw;
        continue;
      }
      for (const ch of Array.from(tok)) {
        const c = stringWidth(ch);
        if (cw + c > width) newLine();
        push(ch, seg);
        cw += c;
      }
    }
  }
  return lines;
}

/** Inline **bold** and `code` spans. Monochrome: bold for emphasis. */
export function inline(s: string): Seg[] {
  return s
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter((p) => p !== "")
    .map((p) =>
      p.startsWith("**") && p.endsWith("**") && p.length > 4
        ? { t: p.slice(2, -2), bold: true }
        : p.startsWith("`") && p.endsWith("`") && p.length > 2
          ? { t: p.slice(1, -1), bold: true }
          : { t: p }
    );
}

/** Minimal markdown-ish renderer: fences, headings, quotes, bullets. */
export function mdLines(text: string, width: number): Seg[][] {
  const out: Seg[][] = [];
  let inCode = false;
  for (const raw of (text || "").replace(/\r/g, "").split("\n")) {
    if (/^\s*```/.test(raw)) {
      inCode = !inCode;
      out.push([{ t: raw.trim().slice(0, Math.max(1, width)), dim: true }]);
      continue;
    }
    if (inCode) {
      for (const l of hardWrap(raw, width - 2)) out.push([{ t: "  " + l, dim: true }]);
      continue;
    }
    if (raw.trim() === "") {
      out.push([]);
      continue;
    }
    const h = raw.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      for (const l of wrapSegs([{ t: h[2], bold: true }], width)) out.push(l);
      continue;
    }
    const q = raw.match(/^>\s?(.*)$/);
    if (q) {
      for (const l of wrapSegs([{ t: q[1], dim: true, italic: true }], width - 2))
        out.push([{ t: "▎ " }, ...l]);
      continue;
    }
    const b = raw.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    let prefix = "";
    let body = raw;
    if (b) {
      prefix = b[1] + (/\d/.test(b[2]) ? b[2] : "•") + " ";
      body = b[3];
    }
    const indent = prefix ? stringWidth(prefix) : 0;
    const wrapped = wrapSegs(inline(body), Math.max(4, width - indent));
    wrapped.forEach((l, i) => {
      if (i === 0 && prefix) out.push([{ t: prefix, bold: true }, ...l]);
      else out.push(indent ? [{ t: " ".repeat(indent) }, ...l] : l);
    });
  }
  return out;
}
