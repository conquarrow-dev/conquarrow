/**
 * P95 D2 — the advance: the server plays every turn no client will.
 *
 * @see docs/spec/online-reliability/online-reliability.md
 */

import type { GameState, InviteSeat, Move } from '@conquarrow/contracts';
import type { HeuristicChooser } from './api-types';

/** Wall-clock budget of one advance, in ms (a transport limit, not balance). */
export const ADVANCE_BUDGET_MS = 20_000;
/** Moves one advance may apply, against a position that passes forever. */
export const ADVANCE_MAX_MOVES = 4096;

export const advance = (
  game: GameState,
  _seats: readonly InviteSeat[],
  _heuristic: HeuristicChooser | undefined,
  _clock: () => number,
): { readonly game: GameState; readonly moves: readonly Move[] } => ({ game, moves: [] });
