import { EFFORT_METICULOUS_PROMPT } from "./effortMeticulous";

// Omni = Meticulous toolset + a header telling the model that its full context
// (every skill, the docs, memory) is appended below. The context itself is
// built at send time by utils/omniHelper.ts.
const OMNI_BLOCK = `<effort level="omni">
You are in Omni mode. The complete tool list is above. Every enabled skill, the system docs, and the saved memory are appended at the end of this prompt in the OMNI CONTEXT block, so you already have them: do NOT call list_skills, load_skills or read_docs just to read them.
Obey the tool syntax exactly. Use the real command instead of describing it. Card commands go in chat, files go through run_cmd. When the user asks for something a tool can do, call the tool.
</effort>`;

export const EFFORT_OMNI_PROMPT = [OMNI_BLOCK, EFFORT_METICULOUS_PROMPT].join("\n\n");
