import {
  RULES_SECTION,
  OUTPUT_ROUTING_SECTION,
  SKILLS_SECTION_STRICT,
  SEARCH_SECTION,
  FETCH_SECTION,
  HISTORY_SECTION,
  ASK_SECTION,
  RUN_CMD_SECTION_FULL,
  RUN_CMD_SECTION_LITE,
  RUN_CMD_BG_SECTION,
  REPLACE_OUTPUT_SECTION,
  REMINDER_SECTION,
} from "./sections";

const EFFORT_BLOCK = `<effort level="meticulous">
You are at Max effort. Follow the output routing strictly. Verify every uncertain or time-sensitive fact with search and fetch. Batch independent commands in one response. After writing or editing a file, read it back and run a quick check (for example a syntax check) before saying it is done. Never claim success without real output.
</effort>`;

export const EFFORT_METICULOUS_PROMPT = [
  EFFORT_BLOCK,
  RULES_SECTION,
  OUTPUT_ROUTING_SECTION,
  SKILLS_SECTION_STRICT,
  SEARCH_SECTION,
  FETCH_SECTION,
  HISTORY_SECTION,
  ASK_SECTION,
  RUN_CMD_SECTION_FULL,
  RUN_CMD_BG_SECTION,
  REPLACE_OUTPUT_SECTION,
  REMINDER_SECTION,
].join("\n\n");
