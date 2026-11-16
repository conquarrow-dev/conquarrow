/**
 * Fixtures for the P95 server suite (online-reliability). Builds on the P18
 * harness (`support.ts`) and the P92 rig (`remote-agent-mcp.support.ts`).
 *
 * @see docs/spec/online-reliability/online-reliability.md
 */

import type { GameState, Move, OnlineHttpResult, OnlinePort } from '@conquarrow/contracts';
import { makeTiling } from '@conquarrow/geometry-tiling';
import { headsOf, isLost, shareCountOf, territoryCountOf } from '@conquarrow/rules-core';
import {
  asRecord,
  gameHeaders,
  gameStateKey,
  openingMatch,
  parseBody,
  persistEnvelope,
} from './support';

/** `POST /moves` with a submit id (P95 D1). */
export const postWithId = (
  api: OnlinePort,
  groupHash: string,
  gameNumber: string,
  bearer: string,
  move: Move,
  version: number,
  submitId: string,
): Promise<OnlineHttpResult> =>
  api.handle({
    method: 'POST',
    path: `/games/${groupHash}/${gameNumber}/moves`,
    headers: gameHeaders(bearer, version),
    body: JSON.stringify({ move, submitId }),
  });

/** `GET /games/{g}/{n}/version` (P95 D5). */
export const getVersion = (
  api: OnlinePort,
  groupHash: string,
  gameNumber: string,
  bearer: string,
): Promise<OnlineHttpResult> =>
  api.handle({
    method: 'GET',
    path: `/games/${groupHash}/${gameNumber}/version`,
    headers: gameHeaders(bearer),
  });

export const bodyOf = (res: OnlineHttpResult): Record<string, unknown> => asRecord(parseBody(res));

/**
 * A three-seat opening with seat 1 stripped of every head, trail and arrow of
 * territory: lost by `T = 0` (SPEC §9), so its only legal move is the pass.
 * Seat 0 is active.
 */
export const seatOneLost = (): GameState => {
  const opening = openingMatch(3);
  const victim = opening.players[1];
  if (victim === undefined) throw new Error('setup: expected 3 players');
  return {
    ...opening,
    groups: new Map([...opening.groups].filter(([, group]) => group.owner !== victim)),
    trails: new Map([...opening.trails].filter(([player]) => player !== victim)),
    territory: new Map([...opening.territory].filter(([, owner]) => owner !== victim)),
  };
};

export const seedEnvelope = (
  s3: Map<string, string>,
  groupHash: string,
  gameNumber: string,
  version: number,
  state: GameState,
): void => {
  s3.set(gameStateKey(groupHash, gameNumber), persistEnvelope(version, state));
};

/** The standings D4 promises, read with rules-core's own readings. */
export const expectedStandings = (
  state: GameState,
  kinds: readonly string[],
): readonly Record<string, unknown>[] => {
  const geometry = makeTiling();
  return state.players.map((player, seat) => ({
    player: String(player),
    seat,
    kind: kinds[seat],
    territory: territoryCountOf(state, player),
    shares: shareCountOf(state, player, geometry),
    heads: headsOf(state, player),
    lost: isLost(state, player, geometry),
  }));
};

/** The log lines persisted at `version`, as moves. */
export const movesAt = (raw: string | undefined, version: number): readonly unknown[] =>
  (raw ?? '')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as { v?: number; move?: unknown })
    .filter((line) => line.v === version && line.move !== undefined)
    .map((line) => line.move);
