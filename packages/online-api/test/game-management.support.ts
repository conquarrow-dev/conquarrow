/**
 * Fixtures for the P96 server suite (game-management). Builds on the P18
 * harness (`support.ts`) and the P92 rig (`remote-agent-mcp.support.ts`).
 *
 * @see docs/spec/game-management/game-management.md
 */

import type { InviteSeat, OnlineHttpResult, OnlinePort, PlannedSeatKind } from '@conquarrow/contracts';
import {
  asRecord,
  expectStatus,
  gameMetaKey,
  parseBody,
  postInvites,
  tokenOf,
  userGroupKey,
  type TestUser,
} from './support';

/** The phrase pinned as text, so a change to the constant fails here (D5). */
export const DELETE_CONFIRM = 'Yes, permanently delete this game';

export const authHeaders = (bearer: string | undefined): { readonly authorization?: string } =>
  bearer === undefined ? {} : { authorization: `Bearer ${bearer}` };

export const getExport = (
  api: OnlinePort,
  groupHash: string,
  gameNumber: string,
  bearer?: string,
): Promise<OnlineHttpResult> =>
  api.handle({
    method: 'GET',
    path: `/games/${groupHash}/${gameNumber}/export`,
    headers: authHeaders(bearer),
  });

export const postManage = (
  api: OnlinePort,
  action: 'delete' | 'name' | 'hide',
  groupHash: string,
  gameNumber: string,
  bearer: string | undefined,
  body?: unknown,
): Promise<OnlineHttpResult> =>
  api.handle({
    method: 'POST',
    path: `/games/${groupHash}/${gameNumber}/${action}`,
    headers: authHeaders(bearer),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

export const postDelete = (
  api: OnlinePort,
  groupHash: string,
  gameNumber: string,
  bearer: string,
  confirm: string = DELETE_CONFIRM,
): Promise<OnlineHttpResult> => postManage(api, 'delete', groupHash, gameNumber, bearer, { confirm });

export const getMyGamesWith = (
  api: OnlinePort,
  bearer: string,
  query: Readonly<Record<string, string>>,
): Promise<OnlineHttpResult> =>
  api.handle({ method: 'GET', path: '/my-games', headers: authHeaders(bearer), query });

export const createNamedInvite = async (
  api: OnlinePort,
  creator: TestUser,
  seats: readonly PlannedSeatKind[],
  name: unknown,
): Promise<string> => {
  const res = await api.handle({
    method: 'POST',
    path: '/invites',
    headers: authHeaders(creator.bearer),
    body: JSON.stringify({ seats, name }),
  });
  expectStatus(res, 201);
  return tokenOf(parseBody(res));
};

export { postInvites };

export const hiddenKey = (userHash: string, groupHash: string, gameNumber: string): string =>
  `conquarrow/users/${userHash}/hidden/${groupHash}/${gameNumber}`;

export const gamePrefix = (groupHash: string, gameNumber: string): string =>
  `conquarrow/groups/${groupHash}/games/${gameNumber}/`;

export const keysUnder = (s3: ReadonlyMap<string, string>, prefix: string): readonly string[] =>
  [...s3.keys()].filter((key) => key.startsWith(prefix)).sort();

export const metaOf = (
  s3: ReadonlyMap<string, string>,
  groupHash: string,
  gameNumber: string,
): Record<string, unknown> => {
  const raw = s3.get(gameMetaKey(groupHash, gameNumber));
  if (raw === undefined) throw new Error('expected a game meta');
  return asRecord(JSON.parse(raw) as unknown);
};

export interface PlantedGame {
  readonly groupHash: string;
  readonly gameNumber: string;
  readonly seats: readonly InviteSeat[];
  readonly players: readonly string[];
  readonly activePlayer: string;
  readonly members: readonly string[];
  readonly winner?: string;
  readonly startedAt?: string;
  readonly lastActivityAt?: string;
  readonly turns?: number;
  readonly ownerUserHash?: string;
}

/** A game meta stamped with P45's summary (no state needed to list it). */
export const plantLibraryGame = (s3: Map<string, string>, game: PlantedGame): void => {
  const meta: Record<string, unknown> = {
    seats: game.seats,
    players: game.players,
    activePlayer: game.activePlayer,
    lostPlayers: [],
  };
  if (game.winner !== undefined) meta['winner'] = game.winner;
  if (game.startedAt !== undefined) meta['startedAt'] = game.startedAt;
  if (game.lastActivityAt !== undefined) meta['lastActivityAt'] = game.lastActivityAt;
  if (game.turns !== undefined) meta['turns'] = game.turns;
  if (game.ownerUserHash !== undefined) meta['ownerUserHash'] = game.ownerUserHash;
  s3.set(gameMetaKey(game.groupHash, game.gameNumber), JSON.stringify(meta));
  for (const hash of game.members) s3.set(userGroupKey(hash, game.groupHash), '{}');
};

export const rowsOf = (res: OnlineHttpResult): readonly Record<string, unknown>[] => {
  const games = asRecord(parseBody(res))['games'];
  if (!Array.isArray(games)) throw new Error('expected body.games');
  return games.map((row) => asRecord(row));
};

export const rowKeys = (res: OnlineHttpResult): readonly string[] =>
  rowsOf(res).map((row) => `${String(row['groupHash'])}/${String(row['gameNumber'])}`);

export const countsOf = (res: OnlineHttpResult): Record<string, unknown> =>
  asRecord(asRecord(parseBody(res))['counts']);

/** A three-letter seat list in the opening's player order. */
export const iso = (ms: number): string => new Date(ms).toISOString();

/** Six-digit game numbers 1…n. */
export const gameNumbers = (n: number): readonly string[] =>
  Array.from({ length: n }, (_, i) => String(i + 1).padStart(6, '0'));
