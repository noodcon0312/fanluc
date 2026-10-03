2.4.1

---

Patch: replaced the npm/GitHub README with the new project page (+0.0.1: 2.4.0 -> 2.4.1).
No code changes.

---

Calculation method:
Minor fix or a few UI changes: + 0.0.1
(e.g., 1.0.0 -> 1.0.1)

Fixing multiple minor bugs, a critical bug, or adding a few new features: + 0.0.5
(e.g., 1.0.1 -> 1.0.6)

Adding many new features or making significant changes: + 0.1
(e.g., 1.0.6 -> 1.1.6)

Major changes, extensive additions or modifications: + 0.5
(e.g., 1.1.6 -> 1.6.6)

Major, comprehensive changes or a new generation: + 1
(e.g., 1.6.6 -> 2.6.6)

---

List what has been added, changed, or removed here:
Upgraded to match tool-ngork-selfhost 2.2.2 (+0.1: 2.2.2 -> 2.3.0):
- Ported full layout and feature set: workspace picker ([DIR:]), background
  shell jobs (run_cmd_bg, cmd_log, cmd_kill, cmd_list), isolated sub-agent
  workspaces with zip export, memory system (read_mem, write_mem, MemPanel,
  JSON export/import), sub-agent system (AgentPanel, list_agent,
  prompt_agent), permission panels and prompts, Turtle graphics card.
- Added omni effort mode (effortOmni) plus prompt sections module.
- Added localExec / localSearch server modules and permissions module.
- Strict style rules: English only (no Vietnamese), no emoji, only black
  (#000000) and white (#ffffff). Weather illustrations, chart series, pie
  slices and translation cards remapped to black-and-white; chart series
  use dash patterns (solid / dashed / dotted) to stay distinguishable.

Terminal TUI like opencode (+0.1: 2.3.0 -> 2.4.0):
- Restored the terminal interface: `fanluc` CLI (src/cli) spawns the
  server plus an Ink full-screen TUI (src/tui), same UX as before
  (sessions sidebar, slash commands, Ink input, permission prompts).
- Agent loop (src/core/agent) reuses the web tool protocol over the local
  server API; file writes ask inline in ask mode, shell approvals come
  from the server permission queue (/api/permissions/pending+decide).
- readOnly blocks writes and shell client-side; all TUI strings English,
  monochrome only.
