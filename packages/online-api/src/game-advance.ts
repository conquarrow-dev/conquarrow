/**
 * P95 D2 — the advance: the server plays every turn no client will.
 *
 * A seat whose only legal move is the pass is passed, whatever its kind (SPEC
 * §9: a lost seat "is offered only the pass; that pass is a move in the log").
 * A heuristic seat is played. The advance stops at the first seat with a step
 * that a human or an agent must choose, at a winner, at its wall-clock budget,
 * or at its move cap. A stop mid-turn leaves a legal position; the next advance
 * carries on from it.
 *
 * @see docs/spec/online-reliability/online-reliability.md
 * @see docs/adr/0011-server-is-source-of-truth.md
 */

import type { GameState, InviteSeat, Move } from '@conquarrow/contracts';
import { endTurn } from '@conquarrow/contracts';
import { makeTiling } from '@conquarrow/geometry-tiling';
import { makeRules } from '@conquarrow/rules-core';
import type { HeuristicChooser } from './api-types';

/** Wall-clock budget of one advance, in ms (a transport limit, not balance). */
export const ADVANCE_BUDGET_MS = 20_000;
/** Moves one advance may apply, against a position that passes forever. */
export const ADVANCE_MAX_MOVES = 4096;
/** Heuristic choices per turn before the server ends that turn for it. */
export const MAX_MOVES_PER_TURN = 64;

export const geometry = makeTiling();
export const rules = makeRules(geometry);

export const applyMove = (game: GameState, move: Move): GameState => rules.apply(game, move);

export const hasStep = (game: GameState): boolean =>
  rules.legalMoves(game).some((move) => move.kind === 'step');

export const activeSeatIndex = (game: GameState): number => {
  const active = String(game.activePlayer);
  return game.players.findIndex((player) => String(player) === active);
};

export const activeSeat = (
  seats: readonly InviteSeat[],
  game: GameState,
): InviteSeat | undefined => seats[activeSeatIndex(game)];

export interface Advanced {
  readonly game: GameState;
  readonly moves: readonly Move[];
}

/**
 * The move the server plays for the active seat, or `undefined` when a human
 * or agent must choose. `choices` counts the heuristic choices this seat has
 * already made in this advance.
 */
const serverMove = (
  game: GameState,
  seats: readonly InviteSeat[],
  heuristic: HeuristicChooser | undefined,
  choices: number,
): Move | undefined => {
  if (!hasStep(game)) return endTurn();
  if (activeSeat(seats, game)?.kind !== 'heuristic' || heuristic === undefined) return undefined;
  return choices < MAX_MOVES_PER_TURN ? heuristic(game) : endTurn();
};

export const advance = (
  game: GameState,
  seats: readonly InviteSeat[],
  heuristic: HeuristicChooser | undefined,
  clock: () => number,
): Advanced => {
  const started = clock();
  const moves: Move[] = [];
  let at = game;
  let seat = at.activePlayer;
  let choices = 0;
  while (at.winner === undefined && moves.length < ADVANCE_MAX_MOVES) {
    if (clock() - started >= ADVANCE_BUDGET_MS) break;
    const move = serverMove(at, seats, heuristic, choices);
    if (move === undefined) break;
    at = applyMove(at, move);
    moves.push(move);
    choices = at.activePlayer === seat ? choices + 1 : 0;
    seat = at.activePlayer;
  }
  return { game: at, moves };
};
