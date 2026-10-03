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

const EFFORT_BLOCK = `<effort level="thorough">
You are at Very High effort. Follow the output routing strictly. Verify time-sensitive facts with search and fetch. Batch independent commands in one response. After writing or editing a file, read the relevant part back before saying it is done.
</effort>`;

export const EFFORT_THOROUGH_PROMPT = [
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
