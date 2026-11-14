/**
 * The whole board for the agent seat, and a text map of it (P93).
 *
 * Pure: no clock, no I/O. `boardView` lists every territory arrow, trail
 * arrow, stack and spawner. `boardMap` draws a board on the generated
 * tiling's own layout. `parseBoardView` reads one back from JSON.
 *
 * Phase 2: signatures only.
 *
 * @see docs/spec/agent-board-map/agent-board-map.md
 */

import type { GameState, GeometryPort, PlayerId } from '@conquarrow/contracts';

/** One stack. Same row as `STATE_JSON.groups`. */
export interface BoardGroupRow {
  readonly arrow: string;
  readonly owner: string;
  readonly heads: number;
  readonly spent: number;
  readonly speed: number;
  readonly speedOverride?: number;
}

/** One spawner. Same row as `STATE_JSON.spawners`. */
export interface BoardSpawnerRow {
  readonly vertex: string;
  readonly force: string;
  readonly held: Readonly<Record<string, number>>;
  readonly unclaimed: number;
}

/** The `board` a full observe returns. */
export interface BoardView {
  readonly me: string;
  readonly players: readonly string[];
  readonly activePlayer: string;
  readonly territory: Readonly<Record<string, readonly string[]>>;
  readonly trails: Readonly<Record<string, readonly string[]>>;
  readonly groups: readonly BoardGroupRow[];
  readonly spawners: readonly BoardSpawnerRow[];
}

export const boardView = (_geometry: GeometryPort, _state: GameState, _me: PlayerId): BoardView => {
  throw new Error('P93 phase 2: boardView is not implemented');
};

export const boardMap = (_board: BoardView): string => {
  throw new Error('P93 phase 2: boardMap is not implemented');
};

export const parseBoardView = (_json: unknown): BoardView | undefined => {
  throw new Error('P93 phase 2: parseBoardView is not implemented');
};
