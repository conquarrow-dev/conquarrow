/**
 * P94 — what the human sees about a submit. Pure: no clock, no fetch, no DOM.
 *
 * @see docs/spec/online-turn-flow/online-turn-flow.md
 */

import type { SubmitOutcome } from '@conquarrow/contracts';

/** D6. The one line under the buttons for an outcome, or `undefined`. */
export const submitNote = (_outcome: SubmitOutcome): string | undefined => undefined;

/** D6. End turn's label: "Sending…" while a submit is in flight. */
export const endTurnLabel = (_sending: boolean): string => 'End turn';
