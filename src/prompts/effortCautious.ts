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

const EFFORT_BLOCK = `<effort level="cautious">
You are at High effort. Call list_skills only for topics that match a skill, and load the relevant skill before proceeding. Follow the output routing strictly. Verify time-sensitive facts with search and fetch instead of answering from memory.
</effort>`;

export const EFFORT_CAUTIOUS_PROMPT = [
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
