/**
 * Fixtures for the P96 web suite (game-management). Builds on the P19 fakes.
 *
 * @see docs/spec/game-management/game-management.md
 */

import type { LibraryCounts, StartedGameRow } from '@conquarrow/contracts';
import {
  GAME_ONE,
  GROUP_HASH,
  boardAt,
  dummyLibrarySeats,
  type ScriptedFetch,
} from './online-web.support';

export const DELETE_CONFIRM = 'Yes, permanently delete this game';
export const EXPORT_PATH = `/games/${GROUP_HASH}/${GAME_ONE}/export`;
export const DELETE_PATH = `/games/${GROUP_HASH}/${GAME_ONE}/delete`;
export const HIDE_PATH = `/games/${GROUP_HASH}/${GAME_ONE}/hide`;
export const NAME_PATH = `/games/${GROUP_HASH}/${GAME_ONE}/name`;

export const exportScript = (status: number, rawBody: string): ScriptedFetch => ({
  method: 'GET',
  path: EXPORT_PATH,
  status,
  rawBody,
});

export const okScript = (path: string, body: unknown): ScriptedFetch => ({
  method: 'POST',
  path,
  status: 200,
  body,
});

export const namedGameScript = (version: number, name: string): ScriptedFetch => ({
  method: 'GET',
  path: `/games/${GROUP_HASH}/${GAME_ONE}`,
  status: 200,
  body: { ...boardAt(version), name, owner: true },
});

export const libraryRow = (overrides: Partial<StartedGameRow> & { readonly gameNumber: string }): StartedGameRow => ({
  groupHash: GROUP_HASH,
  status: 'won',
  section: 'finished',
  seats: dummyLibrarySeats(),
  seatIndex: 0,
  owner: false,
  hidden: false,
  ...overrides,
});

export const counts = (overrides: Partial<LibraryCounts>): LibraryCounts => ({
  'your-turn': 0,
  waiting: 0,
  finished: 0,
  hidden: 0,
  ...overrides,
});

export const finishedRows = (from: number, to: number): readonly StartedGameRow[] =>
  Array.from({ length: to - from }, (_, i) =>
    libraryRow({ gameNumber: String(from + i + 1).padStart(6, '0') }),
  );

export const libraryScript = (
  games: readonly StartedGameRow[],
  libraryCounts: LibraryCounts,
): ScriptedFetch => ({
  method: 'GET',
  path: '/my-games',
  status: 200,
  body: { lobbies: [], games, counts: libraryCounts },
});

export const pageScript = (
  section: string,
  offset: number,
  total: number,
  games: readonly StartedGameRow[],
): ScriptedFetch => ({
  method: 'GET',
  path: '/my-games',
  status: 200,
  body: { section, offset, limit: 10, total, games },
});

export const libraryChanged = (change: 'deleted' | 'renamed') =>
  ({ type: 'libraryChanged', groupHash: GROUP_HASH, gameNumber: GAME_ONE, change }) as const;
