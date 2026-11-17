/**
 * P95 D4 — how a finished game ended: the winner, the turn count, and every
 * seat's standing, read with rules-core's own readings (nothing restated).
 *
 * @see docs/spec/online-reliability/online-reliability.md
 */

import type { GameState, GameSummary, InviteSeat } from '@conquarrow/contracts';
import { headsOf, isLost, shareCountOf, territoryCountOf } from '@conquarrow/rules-core';
import { geometry } from './game-advance';
import { parseLogLine } from './game-log';

export type { GameSummary, SeatStanding } from '@conquarrow/contracts';

/** The `endTurn` moves in a `log.jsonl` body, stamped or not; playtest records are skipped. */
export const turnsInLog = (raw: string | undefined): number => {
  let turns = 0;
  for (const line of (raw ?? '').split('\n')) {
    if (line.length === 0) continue;
    if (parseLogLine(line)?.move.kind === 'endTurn') turns += 1;
  }
  return turns;
};

/** `undefined` while the game has no winner. */
export const summaryOf = (
  game: GameState,
  seats: readonly InviteSeat[],
  log: string | undefined,
): GameSummary | undefined => {
  if (game.winner === undefined) return undefined;
  return {
    winner: String(game.winner),
    turns: turnsInLog(log),
    standings: game.players.map((player, seat) => ({
      player: String(player),
      seat,
      kind: seats[seat]?.kind,
      territory: territoryCountOf(game, player),
      shares: shareCountOf(game, player, geometry),
      heads: headsOf(game, player),
      lost: isLost(game, player, geometry),
    })),
  };
};
