import { EFFORT_FAST_PROMPT } from "./effortFast";
import { EFFORT_CAUTIOUS_PROMPT } from "./effortCautious";
import { EFFORT_THOROUGH_PROMPT } from "./effortThorough";
import { EFFORT_METICULOUS_PROMPT } from "./effortMeticulous";
import { EFFORT_OMNI_PROMPT } from "./effortOmni";
import { ROLE_USER_PROMPT } from "./roleUser";
import { EffortLevel } from "../types";

export {
  EFFORT_FAST_PROMPT,
  EFFORT_CAUTIOUS_PROMPT,
  EFFORT_THOROUGH_PROMPT,
  EFFORT_METICULOUS_PROMPT,
  EFFORT_OMNI_PROMPT,
  ROLE_USER_PROMPT,
};

export interface EffortOption {
  id: EffortLevel;
  title: string;
  subtitle: string;
  description: string;
  prompt: string;
}

export const EFFORT_OPTIONS: EffortOption[] = [
  {
    id: "fast",
    title: "Fast",
    subtitle: "Few tools available; best suited for quick projects or chats.",
    description: "Few tools available; best suited for quick projects or chats.",
    prompt: EFFORT_FAST_PROMPT,
  },
  {
    id: "cautious",
    title: "Cautious",
    subtitle: "Suitable for standard projects.",
    description: "Suitable for standard projects.",
    prompt: EFFORT_CAUTIOUS_PROMPT,
  },
  {
    id: "thorough",
    title: "Thorough",
    subtitle: "More tools, good for work.",
    description: "More tools, good for work.",
    prompt: EFFORT_THOROUGH_PROMPT,
  },
  {
    id: "meticulous",
    title: "Meticulous",
    subtitle: "Includes almost all tools; not recommended if you only need it for casual chatting.",
    description: "Includes almost all tools; not recommended if you only need it for casual chatting.",
    prompt: EFFORT_METICULOUS_PROMPT,
  },
  {
    id: "omni",
    title: "Omni",
    subtitle: "For models that ignore instructions. Full tool list plus every skill, the docs and memory are loaded up front.",
    description:
      "Use only when a model will not follow instructions. It receives the full tool list, every skill, the docs and memory in one prompt (large). Not recommended if you already know the tools and can steer the model yourself.",
    prompt: EFFORT_OMNI_PROMPT,
  },
];

export function getEffortPrompt(effort: EffortLevel = "fast"): string {
  switch (effort) {
    case "cautious":
      return EFFORT_CAUTIOUS_PROMPT;
    case "thorough":
      return EFFORT_THOROUGH_PROMPT;
    case "meticulous":
      return EFFORT_METICULOUS_PROMPT;
    case "omni":
      return EFFORT_OMNI_PROMPT;
    case "fast":
    default:
      return EFFORT_FAST_PROMPT;
  }
}
