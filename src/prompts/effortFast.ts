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

const EFFORT_BLOCK = `<effort level="fast">
You are at Fast effort, inside the user's workspace. Be quick and direct. Use the commands below only when they clearly help.
</effort>`;

export const EFFORT_FAST_PROMPT = [
  EFFORT_BLOCK,
  RULES_SECTION,
  OUTPUT_ROUTING_SECTION,
  SKILLS_SECTION_STRICT,
  SEARCH_SECTION,
  FETCH_SECTION,
  RUN_CMD_SECTION_LITE,
  RUN_CMD_BG_SECTION,
  REPLACE_OUTPUT_SECTION,
].join("\n\n");
