import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { parseBracedCommands } from "../utils/codeRunner";
import { RandomFontText } from "../utils/randomFont";

// ============================================================================
// turtle_card{...}: a tiny LOGO/turtle-graphics DSL the AI writes to draw
// shapes step by step. Reuses the same heredoc/quote-aware balanced-brace
// parser as run_cmd/replace_output, since the DSL's own repeat{...} blocks
// and print "..." strings need exactly that same robustness.
// ============================================================================

export function parseTurtleCardCommands(text: string) {
  return parseBracedCommands(text, /\bturtle_card\s*\{/gi);
}

export function stripTurtleCardCommands(text: string): string {
  if (!text || typeof text !== "string") return "";
  let cleaned = text;
  for (const cmd of parseTurtleCardCommands(cleaned)) {
    cleaned = cleaned.replace(cmd.fullMatch, "");
  }
  cleaned = cleaned.replace(/\bturtle_card\s*\{[\s\S]*?(?:\}|$)/gi, "");
  return cleaned.trim();
}

// ---------------------------------------------------------------- AST -----

type TurtleNode =
  | { kind: "forward"; value: number }
  | { kind: "turn"; value: number } // positive = right/clockwise
  | { kind: "pen"; down: boolean }
  | { kind: "color"; value: string }
  | { kind: "pensize"; value: number }
  | { kind: "goto"; x: number; y: number }
  | { kind: "home" }
  | { kind: "clear" }
  | { kind: "speed"; value: number }
  | { kind: "print"; text: string }
  | { kind: "repeat"; count: number | "forever"; body: TurtleNode[] };

const NUM = "(-?\\d+(?:\\.\\d+)?)";
const LINE_PATTERNS: { re: RegExp; build: (m: RegExpMatchArray) => TurtleNode }[] = [
  { re: new RegExp(`^(?:forward|fd)\\s+${NUM}$`, "i"), build: (m) => ({ kind: "forward", value: parseFloat(m[1]) }) },
  { re: new RegExp(`^(?:back(?:ward)?|bk)\\s+${NUM}$`, "i"), build: (m) => ({ kind: "forward", value: -parseFloat(m[1]) }) },
  { re: new RegExp(`^(?:right|rt)\\s+${NUM}$`, "i"), build: (m) => ({ kind: "turn", value: parseFloat(m[1]) }) },
  { re: new RegExp(`^(?:left|lt)\\s+${NUM}$`, "i"), build: (m) => ({ kind: "turn", value: -parseFloat(m[1]) }) },
  { re: /^(?:penup|pu)$/i, build: () => ({ kind: "pen", down: false }) },
  { re: /^(?:pendown|pd)$/i, build: () => ({ kind: "pen", down: true }) },
  { re: /^(?:color|pencolor)\s+(\S+)$/i, build: (m) => ({ kind: "color", value: m[1] }) },
  { re: new RegExp(`^(?:pensize|width)\\s+${NUM}$`, "i"), build: (m) => ({ kind: "pensize", value: Math.max(1, parseFloat(m[1])) }) },
  { re: new RegExp(`^(?:goto|setpos)\\s+${NUM}\\s+${NUM}$`, "i"), build: (m) => ({ kind: "goto", x: parseFloat(m[1]), y: parseFloat(m[2]) }) },
  { re: /^home$/i, build: () => ({ kind: "home" }) },
  { re: /^clear$/i, build: () => ({ kind: "clear" }) },
  { re: new RegExp(`^speed\\s+${NUM}$`, "i"), build: (m) => ({ kind: "speed", value: Math.min(10, Math.max(1, parseFloat(m[1]))) }) },
  { re: /^print\s+"([^"]*)"$/i, build: (m) => ({ kind: "print", text: m[1] }) },
  { re: /^print\s+'([^']*)'$/i, build: (m) => ({ kind: "print", text: m[1] }) },
];

/**
 * Parses the turtle DSL. One command per line; `repeat N {` / `repeat forever {`
 * / `loop {` open a block, a line that is just `}` closes it (matching the
 * style the AI is taught in the skill). Unrecognized/malformed lines are
 * silently skipped rather than throwing, so a small typo doesn't blank the
 * whole drawing.
 */
export function parseTurtleScript(script: string): TurtleNode[] {
  const lines = script.split("\n").map((l) => l.trim());
  const root: TurtleNode[] = [];
  const stack: TurtleNode[][] = [root];
  const repeatOpenRe = /^repeat\s+(\d+|forever)\s*\{$/i;
  const loopOpenRe = /^loop\s*\{$/i;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s*(?:#|\/\/).*$/, "").trim();
    if (!line) continue;

    const repeatMatch = line.match(repeatOpenRe);
    if (repeatMatch) {
      const countToken = repeatMatch[1].toLowerCase();
      const node: TurtleNode = {
        kind: "repeat",
        count: countToken === "forever" ? "forever" : Math.max(1, parseInt(countToken, 10)),
        body: [],
      };
      stack[stack.length - 1].push(node);
      stack.push(node.body);
      continue;
    }
    if (loopOpenRe.test(line)) {
      const node: TurtleNode = { kind: "repeat", count: "forever", body: [] };
      stack[stack.length - 1].push(node);
      stack.push(node.body);
      continue;
    }
    if (line === "}") {
      if (stack.length > 1) stack.pop();
      continue;
    }

    for (const { re, build } of LINE_PATTERNS) {
      const m = line.match(re);
      if (m) {
        stack[stack.length - 1].push(build(m));
        break;
      }
    }
    // Anything else (typo, unsupported command): silently ignored.
  }

  return root;
}

// -------------------------------------------------------- flatten to steps --

export interface TurtleDrawStep {
  type: "line" | "point";
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  draw: boolean;
  color: string;
  width: number;
}
export type TurtleTimelineEntry = { kind: "draw"; step: TurtleDrawStep } | { kind: "print"; text: string } | { kind: "clear" };

interface FlattenState {
  x: number;
  y: number;
  heading: number; // degrees, 0 = facing up/north, positive = clockwise
  penDown: boolean;
  color: string;
  width: number;
}

function moveState(state: FlattenState, distance: number): { x: number; y: number } {
  const rad = (state.heading * Math.PI) / 180;
  return {
    x: state.x + distance * Math.sin(rad),
    y: state.y + distance * Math.cos(rad),
  };
}

// A safety cap so a `repeat 999999999 { ... }` (typo or runaway AI output)
// can't hang the browser tab while flattening.
const MAX_FLATTENED_STEPS = 20000;
// How many iterations of a `repeat forever` / `loop` body to pre-flatten as
// its "one cycle" for the animator to repeat -- NOT a limit on how long it
// actually plays (the player just keeps re-running this cycle while Playing).
const FOREVER_CYCLE_GUARD = 100000;

function walk(
  nodes: TurtleNode[],
  state: FlattenState,
  out: TurtleTimelineEntry[],
  budget: { remaining: number }
): "ok" | "forever" {
  for (const node of nodes) {
    if (budget.remaining <= 0) return "ok";
    switch (node.kind) {
      case "forward": {
        const from = { x: state.x, y: state.y };
        const to = moveState(state, node.value);
        state.x = to.x;
        state.y = to.y;
        out.push({
          kind: "draw",
          step: { type: "line", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, draw: state.penDown, color: state.color, width: state.width },
        });
        budget.remaining--;
        break;
      }
      case "turn":
        state.heading = (state.heading + node.value) % 360;
        break;
      case "pen":
        state.penDown = node.down;
        break;
      case "color":
        state.color = node.value;
        break;
      case "pensize":
        state.width = node.value;
        break;
      case "goto": {
        const from = { x: state.x, y: state.y };
        state.x = node.x;
        state.y = node.y;
        out.push({
          kind: "draw",
          step: { type: "line", fromX: from.x, fromY: from.y, toX: node.x, toY: node.y, draw: state.penDown, color: state.color, width: state.width },
        });
        budget.remaining--;
        break;
      }
      case "home": {
        const from = { x: state.x, y: state.y };
        state.x = 0;
        state.y = 0;
        state.heading = 0;
        out.push({
          kind: "draw",
          step: { type: "line", fromX: from.x, fromY: from.y, toX: 0, toY: 0, draw: state.penDown, color: state.color, width: state.width },
        });
        budget.remaining--;
        break;
      }
      case "clear":
        out.push({ kind: "clear" });
        budget.remaining--;
        break;
      case "print":
        out.push({ kind: "print", text: node.text });
        budget.remaining--;
        break;
      case "repeat": {
        if (node.count === "forever") return "forever";
        for (let i = 0; i < node.count; i++) {
          const res = walk(node.body, state, out, budget);
          if (res === "forever" || budget.remaining <= 0) return res;
        }
        break;
      }
      // "speed" is read separately below (it needs to apply globally, and
      // the AI may set it anywhere in the script), not during this walk.
    }
  }
  return "ok";
}

export interface FlattenedTurtleProgram {
  steps: TurtleTimelineEntry[];
  loopBody: TurtleTimelineEntry[] | null; // non-null if the script ends in an infinite loop
  speed: number; // 1 (slow) .. 10 (fast)
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

function firstSpeed(nodes: TurtleNode[]): number | null {
  for (const n of nodes) {
    if (n.kind === "speed") return n.value;
    if (n.kind === "repeat") {
      const s = firstSpeed(n.body);
      if (s !== null) return s;
    }
  }
  return null;
}

export function flattenTurtleProgram(ast: TurtleNode[]): FlattenedTurtleProgram {
  const state: FlattenState = { x: 0, y: 0, heading: 0, penDown: true, color: "black", width: 2 };
  const steps: TurtleTimelineEntry[] = [];
  const budget = { remaining: MAX_FLATTENED_STEPS };

  // If the script ends in a top-level `repeat forever`/`loop`, flatten
  // everything before it normally, then flatten ONE cycle of its body
  // separately as `loopBody` for the animator to repeat indefinitely.
  let bodyNodes = ast;
  let tailForever: TurtleNode | null = null;
  if (ast.length > 0) {
    const last = ast[ast.length - 1];
    if (last.kind === "repeat" && last.count === "forever") {
      bodyNodes = ast.slice(0, -1);
      tailForever = last;
    }
  }

  walk(bodyNodes, state, steps, budget);

  let loopBody: TurtleTimelineEntry[] | null = null;
  if (tailForever && tailForever.kind === "repeat") {
    const loopBudget = { remaining: FOREVER_CYCLE_GUARD };
    const cycle: TurtleTimelineEntry[] = [];
    walk(tailForever.body, state, cycle, loopBudget);
    loopBody = cycle;
  }

  const bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const consider = (x: number, y: number) => {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
  };
  for (const entry of [...steps, ...(loopBody || [])]) {
    if (entry.kind === "draw") {
      consider(entry.step.fromX, entry.step.fromY);
      consider(entry.step.toX, entry.step.toY);
    }
  }

  return { steps, loopBody, speed: firstSpeed(ast) ?? 5, bounds };
}

// -------------------------------------------------------------- component --

export interface TurtleCardProps {
  script: string;
}

const CANVAS_W = 520;
const CANVAS_H = 340;
const PADDING = 24;

export const TurtleCard: React.FC<TurtleCardProps> = ({ script }) => {
  const program = useMemo(() => flattenTurtleProgram(parseTurtleScript(script)), [script]);
  const [view, setView] = useState<"preview" | "code">("preview");
  const [isPlaying, setIsPlaying] = useState<boolean>(!!program.loopBody);
  const [log, setLog] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<number | null>(null);

  // Logical-to-pixel mapping: fit the drawn extent into the canvas with
  // padding, y flipped (turtle "up" = smaller pixel y), origin centered.
  const mapping = useMemo(() => {
    const { minX, maxX, minY, maxY } = program.bounds;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const scale = Math.min((CANVAS_W - PADDING * 2) / w, (CANVAS_H - PADDING * 2) / h, 12);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return {
      toPx: (x: number, y: number) => ({
        px: CANVAS_W / 2 + (x - cx) * scale,
        py: CANVAS_H / 2 - (y - cy) * scale,
      }),
    };
  }, [program.bounds]);

  /**
   * Black-and-white only pen. Named colors other than black/white and
   * arbitrary hex colors fall back to black so lines stay visible on
   * the white canvas.
   */
  const toBWPen = (c: string): string => {
    const v = (c || "").trim().toLowerCase();
    if (v === "white" || v === "#ffffff" || v === "#fff") return "#ffffff";
    if (v === "black" || v === "#000000" || v === "#000") return "#000000";
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const r = parseInt(h.slice(0, 2), 16) / 255;
      const g = parseInt(h.slice(2, 4), 16) / 255;
      const b = parseInt(h.slice(4, 6), 16) / 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return lum >= 0.5 ? "#ffffff" : "#000000";
    }
    return "#000000";
  };

  const drawSegment = (ctx: CanvasRenderingContext2D, step: TurtleDrawStep) => {
    if (!step.draw) return;
    const a = mapping.toPx(step.fromX, step.fromY);
    const b = mapping.toPx(step.toX, step.toY);
    ctx.strokeStyle = toBWPen(step.color);
    ctx.lineWidth = step.width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
  };

  const clearCanvas = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  };

  // Draw the whole finite program statically (no animation) -- the default
  // view for a program with no infinite loop tail, so the result shows up
  // immediately without requiring the person to press Play.
  const drawStatic = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    clearCanvas(ctx);
    const lines: string[] = [];
    for (const entry of program.steps) {
      if (entry.kind === "clear") clearCanvas(ctx);
      else if (entry.kind === "print") lines.push(entry.text);
      else drawSegment(ctx, entry.step);
    }
    setLog(lines);
  };

  useEffect(() => {
    drawStatic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program]);

  // Animation loop: replays `steps` once, then -- if there's a loopBody --
  // keeps replaying it cycle after cycle until Stop is pressed.
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    clearCanvas(ctx);
    setLog([]);

    const all: TurtleTimelineEntry[] = [...program.steps];
    let cycleStart = all.length;
    let i = 0;
    const delayMs = Math.round(220 - program.speed * 20); // speed 1 (slow) -> ~200ms, 10 (fast) -> ~20ms

    timerRef.current = window.setInterval(() => {
      if (i >= all.length) {
        if (!program.loopBody || program.loopBody.length === 0) {
          setIsPlaying(false);
          return;
        }
        all.push(...program.loopBody);
      }
      const entry = all[i];
      i++;
      if (entry.kind === "clear") clearCanvas(ctx);
      else if (entry.kind === "print") setLog((prev) => [...prev, entry.text]);
      else drawSegment(ctx, entry.step);
    }, Math.max(10, delayMs));

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, program]);

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      drawStatic(); // snap back to the finished static drawing when stopped
    } else {
      setIsPlaying(true);
    }
  };

  return (
    <div className="my-3 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white max-w-xl">
      <div className="flex items-center justify-between border-b border-black dark:border-white px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setView("preview")}
            className={`px-2 py-0.5 border border-black dark:border-white text-[11px] font-mono uppercase ${
              view === "preview" ? "bg-black text-white dark:bg-white dark:text-black" : ""
            }`}
          >
            <RandomFontText text="preview" />
          </button>
          <button
            type="button"
            onClick={() => setView("code")}
            className={`px-2 py-0.5 border border-black dark:border-white text-[11px] font-mono uppercase ${
              view === "code" ? "bg-black text-white dark:bg-white dark:text-black" : ""
            }`}
          >
            <RandomFontText text="code" />
          </button>
        </div>
        {view === "preview" && (
          <button
            type="button"
            onClick={togglePlay}
            title={isPlaying ? "Stop" : "Play"}
            className="w-7 h-7 flex items-center justify-center border border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
          >
            {isPlaying ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
          </button>
        )}
      </div>

      {view === "preview" ? (
        <>
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="block w-full bg-white" />
          <div className="border-t border-black dark:border-white px-2 py-1.5 text-[11px] font-mono max-h-24 overflow-y-auto">
            <div className="opacity-60 uppercase mb-0.5">
              <RandomFontText text="Log" />
            </div>
            {log.length === 0 ? (
              <div className="opacity-40">—</div>
            ) : (
              log.map((line, i) => <div key={i}>{line}</div>)
            )}
          </div>
        </>
      ) : (
        <pre className="p-2 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto max-h-72 overflow-y-auto">{script.trim()}</pre>
      )}
    </div>
  );
};
