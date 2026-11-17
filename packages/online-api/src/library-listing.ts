/**
 * Library summary stamp on persist, and caller-relative `/my-games` listing (P45/P46).
 *
 * Listing does not write game objects. Classification is `libraryStatusFor` in
 * contracts; `isLost` is only called here when stamping or hydrating unstamped meta.
 * Profile upsert on GET /my-games lives in `handleMyGames`, not here.
 */

import type {
  GameState,
  InviteSeat,
  LibraryCounts,
  LibraryGameStatus,
  LibraryList,
  LibraryPageBody,
  LibrarySeat,
  LibrarySection,
  LibrarySummary,
  StartedGameRow,
} from '@conquarrow/contracts';
import {
  FINISHED_PAGE,
  MAX_LIBRARY_PAGE,
  libraryStatusFor,
  playerLetterLabel,
} from '@conquarrow/contracts';
import { makeTiling } from '@conquarrow/geometry-tiling';
import { isLost } from '@conquarrow/rules-core';
import type { ObjectStore } from './api-types';
import { parsePersistedEnvelope } from './game-snapshot';
import { compareStrings } from './hashing';
import {
  asRecord,
  boundUserHash,
  boundAgentUserHash,
  indexOfCallerSeat,
  parseGameMeta,
  type GameMeta,
} from './invite-record';
import { gameOwner } from './game-member';
import { gameMetaKey, gamesPrefix, gameStateKey, hiddenPrefix, userGroupPrefix } from './s3-keys';
import { getObject, listObjects, putObject } from './store-io';
import { readProfileDisplayName } from './user-profile';

const geometry = makeTiling();
const GAME_META = /\/games\/(\d{6})\/meta\.json$/;

type GamePointer = {
  readonly groupHash: string;
  readonly gameNumber: string;
};

type NameCache = Map<string, string | undefined>;

const lastSegment = (key: string, prefix: string): string | undefined => {
  if (!key.startsWith(prefix)) return undefined;
  const rest = key.slice(prefix.length);
  if (rest.length === 0 || rest.includes('/')) return undefined;
  return rest;
};

/** P96 D8: where a status is listed. */
export const sectionOf = (status: LibraryGameStatus): LibrarySection =>
  status === 'won' || status === 'lost' ? 'finished' : status;

const SECTION_RANK: Readonly<Record<LibrarySection, number>> = {
  'your-turn': 0,
  waiting: 1,
  finished: 2,
};

const activityOf = (row: StartedGameRow): string | undefined => row.lastActivityAt ?? row.startedAt;

/** P96 D8: newest activity first; a row with none goes last. */
const compareActivity = (left: StartedGameRow, right: StartedGameRow): number => {
  const a = activityOf(left);
  const b = activityOf(right);
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return compareStrings(b, a);
};

/** P96 D8: section, then last activity, then group and newest game number. */
const compareLibraryRows = (left: StartedGameRow, right: StartedGameRow): number => {
  const bySection = SECTION_RANK[left.section] - SECTION_RANK[right.section];
  if (bySection !== 0) return bySection;
  const byActivity = compareActivity(left, right);
  if (byActivity !== 0) return byActivity;
  const byGroup = compareStrings(left.groupHash, right.groupHash);
  if (byGroup !== 0) return byGroup;
  return compareStrings(right.gameNumber, left.gameNumber);
};

const lostPlayerIdsOf = (game: GameState): readonly string[] =>
  game.players
    .filter((player) => isLost(game, player, geometry))
    .map(String)
    .toSorted(compareStrings);

const librarySummaryFromGame = (game: GameState): LibrarySummary => {
  const summary: {
    players: readonly string[];
    activePlayer: string;
    lostPlayers: readonly string[];
    winner?: string;
  } = {
    players: [...game.players].map(String),
    activePlayer: String(game.activePlayer),
    lostPlayers: lostPlayerIdsOf(game),
  };
  if (game.winner !== undefined) {
    summary.winner = String(game.winner);
  }
  return summary;
};

const librarySummaryFromMeta = (meta: GameMeta): LibrarySummary | undefined => {
  if (meta.players === undefined || meta.activePlayer === undefined || meta.lostPlayers === undefined) {
    return undefined;
  }
  const summary: {
    players: readonly string[];
    activePlayer: string;
    lostPlayers: readonly string[];
    winner?: string;
  } = {
    players: meta.players,
    activePlayer: meta.activePlayer,
    lostPlayers: meta.lostPlayers,
  };
  if (meta.winner !== undefined) {
    summary.winner = meta.winner;
  }
  return summary;
};

/** P96 D7: when the version was persisted and how many turns its log holds. */
export interface ActivityStamp {
  readonly lastActivityAt: string;
  readonly turns: number;
}

export const stampLibrarySummary = async (
  s3: ObjectStore,
  groupHash: string,
  gameNumber: string,
  game: GameState,
  activity?: ActivityStamp,
): Promise<void> => {
  const key = gameMetaKey(groupHash, gameNumber);
  const raw = await getObject(s3, key);
  if (raw === undefined) return;
  const rec = asRecord(JSON.parse(raw) as unknown) ?? {};
  const summary = librarySummaryFromGame(game);
  const body: Record<string, unknown> = {
    ...rec,
    players: summary.players,
    activePlayer: summary.activePlayer,
    lostPlayers: summary.lostPlayers,
    ...activity,
  };
  if (summary.winner !== undefined) {
    body['winner'] = summary.winner;
  }
  await putObject(s3, key, JSON.stringify(body));
};

const summaryFromState = async (
  s3: ObjectStore,
  pointer: GamePointer,
): Promise<LibrarySummary | undefined> => {
  const raw = await getObject(s3, gameStateKey(pointer.groupHash, pointer.gameNumber));
  if (raw === undefined) return undefined;
  const persisted = parsePersistedEnvelope(raw);
  return persisted === undefined ? undefined : librarySummaryFromGame(persisted.game);
};

/** The stamped summary, else (unstamped meta) one read from the position. */
const summaryOfMeta = async (
  s3: ObjectStore,
  meta: GameMeta | undefined,
  pointer: GamePointer,
): Promise<LibrarySummary | undefined> => {
  const fromMeta = meta === undefined ? undefined : librarySummaryFromMeta(meta);
  return fromMeta ?? summaryFromState(s3, pointer);
};

const cachedDisplayName = async (
  s3: ObjectStore,
  userHash: string,
  names: NameCache,
): Promise<string | undefined> => {
  if (names.has(userHash)) return names.get(userHash);
  const name = await readProfileDisplayName(s3, userHash);
  names.set(userHash, name);
  return name;
};

const librarySeatOf = (
  seat: InviteSeat,
  index: number,
  callerHash: string,
  displayName: string | undefined,
): LibrarySeat => {
  if (seat.kind === 'heuristic') {
    return { kind: 'heuristic', label: 'AI', you: false };
  }
  if (seat.kind === 'agent') {
    const you = boundAgentUserHash(seat) === callerHash;
    const label = agentLabel(displayName);
    return { kind: 'agent', label, you };
  }
  const you = boundUserHash(seat) === callerHash;
  const label = displayName ?? playerLetterLabel(index);
  return { kind: 'human', label, you };
};

export const agentLabel = (displayName: string | undefined): string =>
  displayName === undefined ? 'Agent' : `Agent (${displayName})`;

/** GET game adds `label` on agent seats only. Human and heuristic objects stay as stored. */
export const seatsForClient = async (
  s3: ObjectStore,
  seats: readonly InviteSeat[],
): Promise<readonly (InviteSeat & { readonly label?: string })[]> => {
  const names: NameCache = new Map();
  const listed: (InviteSeat & { readonly label?: string })[] = [];
  for (const seat of seats) {
    if (seat.kind !== 'agent') {
      listed.push(seat);
      continue;
    }
    const bound = seat.userHash;
    const name = bound === undefined ? undefined : await cachedDisplayName(s3, bound, names);
    listed.push({ ...seat, label: agentLabel(name) });
  }
  return listed;
};

const librarySeatsOf = async (
  s3: ObjectStore,
  seats: readonly InviteSeat[],
  callerHash: string,
  names: NameCache,
): Promise<readonly LibrarySeat[]> => {
  const listed: LibrarySeat[] = [];
  for (let index = 0; index < seats.length; index += 1) {
    const seat = seats[index];
    if (seat === undefined) continue;
    const bound = boundUserHash(seat) ?? boundAgentUserHash(seat);
    const displayName =
      bound === undefined ? undefined : await cachedDisplayName(s3, bound, names);
    listed.push(librarySeatOf(seat, index, callerHash, displayName));
  }
  return listed;
};

/** P96 D8: the seat to move, or the winner and its label. */
const turnFieldsOf = (
  summary: LibrarySummary | undefined,
  seats: readonly LibrarySeat[],
): Pick<StartedGameRow, 'activeSeat' | 'winner'> => {
  if (summary === undefined) return {};
  if (summary.winner === undefined) {
    const activeSeat = summary.players.indexOf(summary.activePlayer);
    return activeSeat < 0 ? {} : { activeSeat };
  }
  const seat = summary.players.indexOf(summary.winner);
  const label = seats[seat]?.label;
  return seat < 0 || label === undefined ? {} : { winner: { seat, label } };
};

const metaFieldsOf = (
  meta: GameMeta | undefined,
): Pick<StartedGameRow, 'name' | 'startedAt' | 'lastActivityAt' | 'turns'> => ({
  ...(meta?.name === undefined ? {} : { name: meta.name }),
  ...(meta?.startedAt === undefined ? {} : { startedAt: meta.startedAt }),
  ...(meta?.lastActivityAt === undefined ? {} : { lastActivityAt: meta.lastActivityAt }),
  ...(meta?.turns === undefined ? {} : { turns: meta.turns }),
});

const pointerId = (groupHash: string, gameNumber: string): string => `${groupHash}/${gameNumber}`;

const listedRowOf = async (
  s3: ObjectStore,
  userHash: string,
  pointer: GamePointer,
  names: NameCache,
  hidden: ReadonlySet<string>,
): Promise<StartedGameRow> => {
  const rawMeta = await getObject(s3, gameMetaKey(pointer.groupHash, pointer.gameNumber));
  const meta = rawMeta === undefined ? undefined : parseGameMeta(rawMeta);
  const seats = meta?.seats ?? [];
  const boundIndex = indexOfCallerSeat(seats, userHash);
  const summary = await summaryOfMeta(s3, meta, pointer);
  const status = summary === undefined ? 'waiting' : libraryStatusFor(userHash, seats, summary);
  const listedSeats = await librarySeatsOf(s3, seats, userHash, names);
  const owner = meta === undefined ? undefined : await gameOwner(s3, meta);
  return {
    groupHash: pointer.groupHash,
    gameNumber: pointer.gameNumber,
    status,
    section: sectionOf(status),
    seats: listedSeats,
    seatIndex: boundIndex < 0 ? 0 : boundIndex,
    ...metaFieldsOf(meta),
    ...turnFieldsOf(summary, listedSeats),
    owner: owner === userHash,
    hidden: hidden.has(pointerId(pointer.groupHash, pointer.gameNumber)),
  };
};

const listGamePointers = async (
  s3: ObjectStore,
  userHash: string,
): Promise<readonly GamePointer[]> => {
  const prefix = userGroupPrefix(userHash);
  const groupKeys = [...(await listObjects(s3, prefix))].sort(compareStrings);
  const games: GamePointer[] = [];
  for (const key of groupKeys) {
    const groupHash = lastSegment(key, prefix);
    if (groupHash === undefined) continue;
    const gameKeys = [...(await listObjects(s3, gamesPrefix(groupHash)))].sort(compareStrings);
    for (const gameKey of gameKeys) {
      const match = GAME_META.exec(gameKey);
      const gameNumber = match?.[1];
      if (gameNumber !== undefined) games.push({ groupHash, gameNumber });
    }
  }
  return games;
};

/** P96 D9: `{groupHash}/{gameNumber}` of every game the caller has hidden. */
const hiddenIds = async (s3: ObjectStore, userHash: string): Promise<ReadonlySet<string>> => {
  const prefix = hiddenPrefix(userHash);
  const ids = new Set<string>();
  for (const key of await listObjects(s3, prefix)) {
    const rest = key.slice(prefix.length);
    if (/^[^/]+\/\d{6}$/.test(rest)) ids.add(rest);
  }
  return ids;
};

/** Every row of the caller's library, hidden ones included, in listing order. */
export const listLibrary = async (
  s3: ObjectStore,
  userHash: string,
): Promise<readonly StartedGameRow[]> => {
  const pointers = await listGamePointers(s3, userHash);
  const hidden = await hiddenIds(s3, userHash);
  const names: NameCache = new Map();
  const games: StartedGameRow[] = [];
  for (const pointer of pointers) {
    games.push(await listedRowOf(s3, userHash, pointer, names, hidden));
  }
  return games.toSorted(compareLibraryRows);
};

const rowsOfList = (rows: readonly StartedGameRow[], list: LibraryList): readonly StartedGameRow[] =>
  list === 'hidden'
    ? rows.filter((row) => row.hidden)
    : rows.filter((row) => !row.hidden && row.section === list);

/** P96 D8: the default `/my-games` games and counts. */
export const libraryFirstPage = (
  rows: readonly StartedGameRow[],
): { readonly games: readonly StartedGameRow[]; readonly counts: LibraryCounts } => {
  const yourTurn = rowsOfList(rows, 'your-turn');
  const waiting = rowsOfList(rows, 'waiting');
  const finishedRows = rowsOfList(rows, 'finished');
  return {
    games: [...yourTurn, ...waiting, ...finishedRows.slice(0, FINISHED_PAGE)],
    counts: {
      'your-turn': yourTurn.length,
      waiting: waiting.length,
      finished: finishedRows.length,
      hidden: rowsOfList(rows, 'hidden').length,
    },
  };
};

export interface LibraryQuery {
  readonly section: LibraryList;
  readonly offset: number;
  readonly limit: number;
}

const LISTS: readonly string[] = ['your-turn', 'waiting', 'finished', 'hidden'];

const intParam = (raw: string | undefined, fallback: number, min: number, max: number): number | undefined => {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) return undefined;
  const value = Number.parseInt(raw, 10);
  return value < min || value > max ? undefined : value;
};

/**
 * P96 D8: `undefined` when the request asks for no page (no `section`,
 * `offset` or `limit`); `'invalid'` for a page it cannot serve.
 */
export const parseLibraryQuery = (
  query: Readonly<Record<string, string>> | undefined,
): LibraryQuery | 'invalid' | undefined => {
  const section = query?.['section'];
  const offsetRaw = query?.['offset'];
  const limitRaw = query?.['limit'];
  if (section === undefined && offsetRaw === undefined && limitRaw === undefined) return undefined;
  if (section === undefined || !LISTS.includes(section)) return 'invalid';
  const offset = intParam(offsetRaw, 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = intParam(limitRaw, FINISHED_PAGE, 1, MAX_LIBRARY_PAGE);
  if (offset === undefined || limit === undefined) return 'invalid';
  return { section: section as LibraryList, offset, limit };
};

/** P96 D8: one page of one list. */
export const libraryPage = (rows: readonly StartedGameRow[], query: LibraryQuery): LibraryPageBody => {
  const listed = rowsOfList(rows, query.section);
  return {
    ...query,
    total: listed.length,
    games: listed.slice(query.offset, query.offset + query.limit),
  };
};
