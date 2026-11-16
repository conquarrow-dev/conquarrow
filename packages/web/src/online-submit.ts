/**
 * P94 — what the human sees about a submit. Pure: no clock, no fetch, no DOM.
 *
 * @see docs/spec/online-turn-flow/online-turn-flow.md
 */

import type { SubmitOutcome } from '@conquarrow/contracts';

const NOTES: Readonly<Partial<Record<SubmitOutcome, string>>> = {
  stale: 'The game moved on before your move arrived. The board has caught up.',
  failed: 'The server did not answer, so your last move may not have been sent. Try again.',
};

/**
 * D6. The one line under the buttons for an outcome, or `undefined`. `illegal`
 * keeps the host's own note and `unauthorized` the sign-in prompt.
 */
export const submitNote = (outcome: SubmitOutcome): string | undefined => NOTES[outcome];

/** D6. End turn's label: "Sending…" while a submit is in flight. */
export const endTurnLabel = (sending: boolean): string => (sending ? 'Sending…' : 'End turn');
