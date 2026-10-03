// Robust turn delimiter — replaces the old human-readable [INTERMEDIATE] tags
// Old tags are trivial for the LLM to accidentally emit, causing parse corruption.
// New tags use rare Unicode brackets ⟦ ⟧ that never appear in normal prose/code,
// plus an internal prefix FANLUC_ so even if the model writes "intermediate" it won't match.
//
// BACKWARD COMPAT: parsers still accept the old [INTERMEDIATE] regex for old
// conversation histories, but NEW turns are always written with the new delimiter.

export const TURN_START = "⟦FANLUC_TURN_START⟧";
export const TURN_END = "⟦FANLUC_TURN_END⟧";

// Escape any accidental occurrence of the delimiter inside model output before wrapping
export function escapeTurnDelimiters(text: string): string {
  if (!text) return text;
  // If the model's raw content already contains our delimiter, neutralise it
  return text
    .split(TURN_START).join("⟦FANLUC_TURN_START_ESCAPED⟧")
    .split(TURN_END).join("⟦FANLUC_TURN_END_ESCAPED⟧");
}

// Wrap a single assistant turn with the delimiter (escaping first)
export function wrapTurn(content: string): string {
  return `${TURN_START}\n${escapeTurnDelimiters(content)}\n${TURN_END}`;
}

// Join multiple stored turns into a single raw string for history re-parsing
export function joinTurns(turns: string[]): string {
  return turns.map(wrapTurn).join("\n\n");
}

// Regexes — new delimiter primary, old delimiter fallback
export const TURN_START_RE = /⟦FANLUC_TURN_START⟧/g;
export const TURN_END_RE = /⟦FANLUC_TURN_END⟧/g;

// Matches either new delimiters or legacy [INTERMEDIATE] variants (tolerant fuzzy)
export const INTERMEDIATE_BLOCK_RE = /⟦FANLUC_TURN_START⟧([\s\S]*?)⟦FANLUC_TURN_END⟧/gi;
export const LEGACY_INTERMEDIATE_RE = /\[INTERMED(?:IATE|IUM|IAT|IA|I|U)?\]?([\s\S]*?)(?:\[\/INTERMED(?:IATE|IUM|IAT|IA|I|U)?\]?|$)/gi;
export const ANY_INTERMEDIATE_RE = /(?:⟦FANLUC_TURN_START⟧|\[INTERMED(?:IATE|IUM|IAT|IA|I|U)?\]?)([\s\S]*?)(?:⟦FANLUC_TURN_END⟧|\[\/INTERMED(?:IATE|IUM|IAT|IA|I|U)?\]?|$)/gi;

// Check if text contains any intermediate marker (new or legacy)
export function hasIntermediateMarker(text: string): boolean {
  return text.includes(TURN_START) || text.includes(TURN_END) || /\[INTERMED/i.test(text);
}
