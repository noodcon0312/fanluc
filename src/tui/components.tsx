import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { w } from "./text.js";
import type { Seg } from "./text.js";
import type { SessionMeta, McpServerInfo, PanelState } from "./types.js";
import { show } from "./settings.js";
import type { Field } from "./settings.js";

const trunc = (s: string, n: number): string =>
  w(s) <= n ? s : Array.from(s).slice(0, Math.max(1, n - 1)).join("") + "…";

export function Header({ width, version }: { width: number; version: string }): React.JSX.Element {
  return (
    <Box
      width={width}
      justifyContent="space-between"
      borderStyle="single"
      borderTop={false}
      borderLeft={false}
      borderRight={false}
    >
      <Text>
        <Text bold>fanluc</Text>
        <Text dimColor> v{version}</Text>
      </Text>
    </Box>
  );
}

export function SegText({ segs }: { segs: Seg[] }): React.JSX.Element {
  if (!segs.length) return <Text> </Text>;
  return (
    <Text wrap="truncate-end">
      {segs.map((s, i) => (
        <Text
          key={i}
          color={s.color}
          bold={s.bold}
          dimColor={s.dim}
          italic={s.italic}
          backgroundColor={s.bg}
        >
          {s.t}
        </Text>
      ))}
    </Text>
  );
}

export function ChatView({
  width,
  height,
  lines,
  scroll,
  frame,
  status,
}: {
  width: number;
  height: number;
  lines: { block?: string; segs: Seg[] }[];
  scroll: number;
  frame: string;
  status: string | null;
}): React.JSX.Element {
  const reserve = status ? 2 : 0;
  const room = Math.max(1, height - reserve);
  const maxScroll = Math.max(0, lines.length - room);
  const off = Math.min(scroll, maxScroll);
  const end = lines.length - off;
  const visible = lines.slice(Math.max(0, end - room), end);
  const pad = room - visible.length;
  return (
    <Box flexDirection="column" width={width} height={height} overflow="hidden">
      {pad > 0 && <Box height={pad} flexShrink={0} />}
      {visible.map((l, i) => (
        <SegText key={i} segs={l.segs} />
      ))}
      {off > 0 && (
        <Text dimColor>
          {"  ↓ "} {off} more lines below (PgDn)
        </Text>
      )}
      {status && (
        <Box flexDirection="column">
          <Text> </Text>
          <Text>
            {"  "}
            {frame} {trunc(status, width - 20)}
            {"  "}
            <Text dimColor>Esc to stop</Text>
          </Text>
        </Box>
      )}
    </Box>
  );
}

export function Sidebar({
  width,
  height,
  sessions,
  currentId,
  query,
  searching,
  sel,
}: {
  width: number;
  height: number;
  sessions: SessionMeta[];
  currentId: string;
  query: string;
  searching: boolean;
  sel: number;
}): React.JSX.Element {
  const rows = Math.max(1, Math.floor((height - 4) / 2));
  const start = Math.min(Math.max(0, sel - Math.floor(rows / 2)), Math.max(0, sessions.length - rows));
  const shown = sessions.slice(start, start + rows);
  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="single" paddingX={1}>
      <Text bold>
        Sessions{" "}
        <Text dimColor>
          [{sessions.length}]
        </Text>
      </Text>
      <Text>
        {"⌕ "}
        {searching ? query + "█" : query || "Ctrl+F search"}
      </Text>
      <Text> </Text>
      {shown.map((s, i) => {
        const idx = start + i;
        const cur = s.id === currentId;
        const active = searching && idx === sel;
        return (
          <Box key={s.id} flexDirection="column">
            <Text bold={cur || active} wrap="truncate-end">
              {cur ? "▸ " : "  "}
              {trunc(s.title, width - 6)}
            </Text>
            <Text dimColor wrap="truncate-end">
              {"    "}
              {s.updatedAt ? new Date(s.updatedAt).toLocaleString() : ""}
            </Text>
          </Box>
        );
      })}
      {sessions.length === 0 && <Text dimColor>(no sessions)</Text>}
    </Box>
  );
}

export function InputBox({
  width,
  value,
  cursor,
  focused,
  label,
  placeholder,
  busy,
}: {
  width: number;
  value: string;
  cursor: number;
  focused: boolean;
  label: string;
  placeholder: string;
  busy: boolean;
}): React.JSX.Element {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!focused) return;
    const t = setInterval(() => setOn((v) => !v), 530);
    return () => clearInterval(t);
  }, [focused]);
  const inner = Math.max(8, width - 6 - w(label));
  const disp = Array.from(value.replace(/\n/g, "⏎"));
  const cur = Math.min(cursor, disp.length);
  let startIdx = 0;
  while (w(disp.slice(startIdx, cur).join("")) > inner - 2 && startIdx < cur) startIdx++;
  const before = disp.slice(startIdx, cur).join("");
  const at = disp[cur] ?? " ";
  const after = disp.slice(cur + 1).join("");
  const room = Math.max(0, inner - w(before) - 1);
  const afterCut = Array.from(after).reduce((acc, ch) => (w(acc + ch) <= room ? acc + ch : acc), "");
  return (
    <Box width={width} height={3} borderStyle="single" paddingX={1}>
      <Text bold>{label}</Text>
      {value === "" ? (
        <Text>
          <Text inverse={focused && on}> </Text>
          <Text dimColor>{placeholder}</Text>
        </Text>
      ) : (
        <Text>
          {before}
          <Text inverse={focused && on}>{at}</Text>
          {afterCut}
        </Text>
      )}
    </Box>
  );
}

export function StatusBar({ width, left, right }: { width: number; left: React.ReactNode; right: string }): React.JSX.Element {
  return (
    <Box width={width} justifyContent="space-between" paddingX={1}>
      <Text wrap="truncate-end">{left}</Text>
      <Text dimColor>{right}</Text>
    </Box>
  );
}

export function Suggestions({
  items,
  sel,
  width,
}: {
  items: { name: string; desc: string; args?: string }[];
  sel: number;
  width: number;
}): React.JSX.Element {
  return (
    <Box flexDirection="column" paddingX={2} width={width}>
      {items.map((c, i) => (
        <Text key={c.name} dimColor={i !== sel} wrap="truncate-end">
          {i === sel ? "› " : "  "}
          {(c.name + (c.args ? " " + c.args : "")).padEnd(34)} {c.desc}
        </Text>
      ))}
    </Box>
  );
}

export function Panel({
  width,
  height,
  title,
  children,
  footer,
}: {
  width: number;
  height: number;
  title: string;
  children: React.ReactNode;
  footer: string;
}): React.JSX.Element {
  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="round" paddingX={1}>
      <Text bold>{title}</Text>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {children}
      </Box>
      <Text dimColor wrap="truncate-end">
        {footer}
      </Text>
    </Box>
  );
}

export function ConfigRows({
  fields,
  values,
  sel,
  editing,
  editBuf,
  width,
  rows,
  msg,
  ok,
}: {
  fields: Field[];
  values: Record<string, unknown>;
  sel: number;
  editing: boolean;
  editBuf: string;
  width: number;
  rows: number;
  msg?: string;
  ok?: boolean;
}): React.JSX.Element {
  const start = Math.min(Math.max(0, sel - Math.floor(rows / 2)), Math.max(0, fields.length - rows));
  return (
    <Box flexDirection="column">
      {fields.slice(start, start + rows).map((f, i) => {
        const idx = start + i;
        const active = idx === sel;
        const val = active && editing ? editBuf + "█" : show(f, values[f.key]);
        return (
          <Text key={f.key} wrap="truncate-end">
            {active ? "› " : "  "}
            {f.label.padEnd(18)}{" "}
            <Text bold={active}>{val}</Text>
            {f.restart ? <Text dimColor> (R)</Text> : null}
          </Text>
        );
      })}
      <Text> </Text>
      <Text dimColor wrap="truncate-end">
        {fields[sel]?.hint}
      </Text>
      {msg ? (
        <Text wrap="truncate-end">
          {ok ? "+ " : "x "}
          {msg}
        </Text>
      ) : (
        <Text> </Text>
      )}
    </Box>
  );
}

export function McpRows({ servers, sel }: { servers: McpServerInfo[]; sel: number }): React.JSX.Element {
  if (servers.length === 0) {
    return <Text dimColor>{"No MCP servers. Add: /mcp add <name> <command|url>"}</Text>;
  }
  return (
    <>
      {servers.map((s, i) => (
        <Text key={s.name} wrap="truncate-end">
          {i === sel ? "› " : "  "}
          <Text bold>{s.status === "connected" ? "●" : s.status === "failed" ? "x" : "○"}</Text> {s.name.padEnd(18)}{" "}
          {s.type.padEnd(6)} {String(s.toolCount).padStart(3)} tool{"  "}
          <Text dimColor>
            {s.status}
            {s.error ? ` — ${s.error}` : ""}
          </Text>
        </Text>
      ))}
    </>
  );
}

export function PermissionBox({
  width,
  type,
  message,
}: {
  width: number;
  type: string;
  message: string;
}): React.JSX.Element {
  return (
    <Box width={width} borderStyle="round" flexDirection="column" paddingX={1}>
      <Text bold>{type === "shell" ? "Agent wants to run a shell command" : type === "approval" ? "Server approval needed" : "Agent wants to write/delete files in the workspace"}</Text>
      <Text dimColor wrap="truncate-end">
        {message.replace(/\s+/g, " ").slice(0, 200)}
      </Text>
      <Text>
        <Text bold>y</Text>/Enter allow · <Text bold>a</Text> allow + switch to autoEdit · <Text bold>n</Text>/Esc deny
      </Text>
    </Box>
  );
}

export type { PanelState };
