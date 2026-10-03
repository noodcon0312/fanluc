import { hardWrap, lineWidth, mdLines, wrapSegs } from "./text.js";
import type { Seg } from "./text.js";
import type { ChatEntry } from "./types.js";

export interface BuiltLine {
  block?: string;
  segs: Seg[];
}

const GLYPH: Record<string, { ch: string }> = {
  running: { ch: "◐" },
  done: { ch: "●" },
  error: { ch: "x" },
};

const oneLine = (s: string, max: number): string => {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, Math.max(1, max - 1)) + "…" : t;
};

function capped(lines: string[], max: number): string[] {
  return lines.length > max ? [...lines.slice(0, max), `… (+${lines.length - max} lines)`] : lines;
}

export interface BuildLinesOpts {
  width: number;
  expanded: Set<string>;
  focusId?: string | null;
  frame?: string;
}

export function buildLines(entries: ChatEntry[], o: BuildLinesOpts): { lines: BuiltLine[]; blocks: string[] } {
  const { width, expanded, focusId } = o;
  const lines: BuiltLine[] = [];
  const blocks: string[] = [];
  const blank = () => lines.push({ segs: [] });
  const header = (id: string, segs: Seg[], isOpen: boolean) => {
    blocks.push(id);
    const focused = focusId === id;
    lines.push({
      block: id,
      segs: [
        { t: focused ? "› " : "  ", bold: true },
        { t: isOpen ? "▼ " : "▶ " },
        ...segs,
      ],
    });
  };
  for (const e of entries) {
    if (e.kind === "user") {
      // Inverted bubble: black text on white background.
      const paint = (s: Seg): Seg => ({ ...s, color: "black", bg: "white" });
      const maxW = Math.max(10, Math.floor((width - 6) * 0.8));
      const wrapped: Seg[][] = [];
      for (const raw of e.text.split("\n")) {
        if (raw.trim() === "") wrapped.push([]);
        else wrapped.push(...wrapSegs([{ t: raw }], maxW));
      }
      const bw = Math.max(1, ...wrapped.map(lineWidth));
      for (const l of wrapped) {
        const pad = " ".repeat(Math.max(0, width - (bw + 5)));
        lines.push({
          segs: [
            paint({ t: pad }),
            paint({ t: "│ " }),
            ...l.map(paint),
            paint({ t: " ".repeat(bw - lineWidth(l) + 1) }),
          ],
        });
      }
      blank();
      continue;
    }
    if (e.kind === "note") {
      for (const raw of e.text.split("\n"))
        for (const l of hardWrap(raw, width - 4))
          lines.push({ segs: [{ t: "  " + l, dim: !e.level, bold: e.level === "error" }] });
      blank();
      continue;
    }
    if (e.thought && (e.thought.text.trim() || e.thought.live)) {
      const id = `${e.id}:th`;
      const open = expanded.has(id);
      header(
        id,
        [
          { t: e.thought.live ? `${o.frame ?? "◐"} ` : "◆ " },
          { t: `Thought | ${e.thought.seconds}s`, italic: true },
        ],
        open
      );
      if (open) {
        const body = e.thought.text
          .split("\n")
          .flatMap((r) => wrapSegs([{ t: r || " ", dim: true, italic: true }], width - 6));
        for (const l of capped(body.map((s) => s.map((x) => x.t).join("")), 80))
          lines.push({ block: id, segs: [{ t: "    │ " }, { t: l, dim: true, italic: true }] });
      }
    }
    for (const t of e.tools) {
      const id = `${e.id}:${t.id}`;
      const open = expanded.has(id);
      const g = GLYPH[t.status] ?? GLYPH.done;
      const isBash = t.name === "Bash";
      header(
        id,
        [
          { t: `${t.status === "running" && o.frame ? o.frame : g.ch} `, bold: true },
          { t: t.name, bold: true },
          { t: "  " + oneLine((isBash ? "$ " : "") + t.input, Math.max(8, width - t.name.length - 22)), dim: true },
          { t: `  ${t.status === "running" ? "running" : t.status === "done" ? "done" : "error"}`, bold: t.status !== "done" },
        ],
        open
      );
      if (open) {
        const inLines = t.input.split("\n");
        // Single-line input already shows in the header - echo it only
        // when it spans multiple lines. Also drop a leading "$ <cmd>"
        // echo line from the output (run-cmd prefixes one) so the command
        // is not repeated in header, input echo and output.
        let outLines = t.output ? t.output.split("\n") : [];
        const echo = "$ " + (inLines[0] ?? "").trim();
        if (outLines.length && outLines[0].trim() === echo) outLines = outLines.slice(1);
        if (inLines.length > 1) {
          const inp = capped(inLines.flatMap((r) => hardWrap(r, width - 8)), 10);
          for (const l of inp) lines.push({ block: id, segs: [{ t: "    │ " }, { t: l, bold: true }] });
        }
        if (outLines.length) {
          lines.push({ block: id, segs: [{ t: "    ├─" }] });
          const out = capped(outLines.flatMap((r) => hardWrap(r, width - 8)), 30);
          for (const l of out) lines.push({ block: id, segs: [{ t: "    │ " }, { t: l, dim: true }] });
        }
      }
    }
    if ((e.thought && (e.thought.text.trim() || e.thought.live)) || e.tools.length) {
      if (e.text.trim()) blank();
    }
    for (const l of mdLines(e.text, width - 2)) lines.push({ segs: l.length ? [{ t: "  " }, ...l] : [] });
    if (e.files && e.files.length) lines.push({ segs: [{ t: "  » " + e.files.join(", "), bold: true }] });
    blank();
  }
  return { lines, blocks };
}
