/**
 * Shared fixtures for docs/spec/agent-board-map — the rebuilt smoke-test game,
 * a small board builder, and a map reader that uses the spec's stated layout
 * (row 2i+j, column j, 3 characters per column) as an independent oracle.
 *
 * @see docs/spec/agent-board-map/agent-board-map.md#the-map
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameState, MatchConfig, Move } from '@conquarrow/contracts';
import { makeMatch, makeTiling } from '@conquarrow/geometry-tiling';
import { makeRules, replay } from '@conquarrow/rules-core';
import type { BoardView } from '../src/board';

export const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, '..', '..', '..');
export const FIXTURE_MATCH = join(here, 'fixtures', 'smoke-2026-11-14.match.json');
export const FIXTURE_MAP = join(here, 'fixtures', 'smoke-2026-11-14.map.txt');

export const geometry = makeTiling();
export const rules = makeRules(geometry);

interface MatchFixture {
  readonly config: MatchConfig;
  readonly moves: readonly Move[];
}

export const loadFixture = (): MatchFixture =>
  JSON.parse(readFileSync(FIXTURE_MATCH, 'utf8')) as MatchFixture;

let cached: GameState | undefined;

/** The smoke-test game, replayed with every move required legal. */
export const fixtureState = (): GameState => {
  if (cached !== undefined) return cached;
  const fixture = loadFixture();
  cached = replay(rules, makeMatch(fixture.config), fixture.moves);
  return cached;
};

export const opening = (playerCount: number): GameState =>
  makeMatch({ dominationN: 5, R: 7, homeOffset: 5, playerCount, spawnerSeed: 1 });

/** A hand-made board for map scenarios. Seats A and B unless overridden. */
export const smallBoard = (overrides: Partial<BoardView> = {}): BoardView => ({
  me: 'B',
  players: ['A', 'B'],
  activePlayer: 'B',
  territory: { A: [], B: [] },
  trails: { A: [], B: [] },
  groups: [],
  spawners: [],
  ...overrides,
});

export const group = (arrow: string, owner: string, heads: number): BoardView['groups'][number] => ({
  arrow,
  owner,
  heads,
  spent: 0,
  speed: 1 + Math.floor(Math.log2(heads)),
});

const ARROW = /^tiling:a:(-?\d+),(-?\d+),([012])$/;
const VERTEX = /^tiling:v:(-?\d+),(-?\d+),(up|down)$/;

/** Where the spec says an arrow is drawn: row 2i+j, column j, slot by direction. */
export const arrowSpot = (id: string): { row: number; col: number; slot: number } => {
  const m = ARROW.exec(id);
  if (m === null) throw new Error(`test oracle: not a tiling arrow ${id}`);
  const i = Number(m[1]);
  const j = Number(m[2]);
  const d = Number(m[3]);
  // left = down-left (d 2), middle = up (d 0), right = down-right (d 1).
  const slot = d === 2 ? 0 : d === 0 ? 1 : 2;
  return { row: 2 * i + j, col: j, slot };
};

/** Where the spec says a spawner is drawn: the vertex cell its centre rounds into. */
export const vertexSpot = (id: string): { row: number; col: number; slot: number } => {
  const m = VERTEX.exec(id);
  if (m === null) throw new Error(`test oracle: not a tiling vertex ${id}`);
  const i = Number(m[1]);
  const j = Number(m[2]);
  return m[3] === 'up'
    ? { row: 2 * i + j + 1, col: j, slot: 2 }
    : { row: 2 * i + j + 2, col: j + 1, slot: 0 };
};

export interface ReadMap {
  readonly lines: readonly string[];
  readonly firstCol: number;
  readonly rows: ReadonlyMap<number, string>;
  readonly stacksLine: string | undefined;
  cell(row: number, col: number): string;
  char(spot: { row: number; col: number; slot: number }): string;
}

const LEGEND_LINES = 4;

/** Read a map back by the spec's line order: header, 3 legend lines, column labels, rows, stacks. */
export const readMap = (text: string): ReadMap => {
  const lines = text.split('\n');
  const labels = lines[LEGEND_LINES] ?? '';
  const first = /-?\d+/.exec(labels);
  if (first === null) throw new Error(`test oracle: no column labels in line ${String(LEGEND_LINES + 1)}`);
  const firstCol = Number(first[0]);
  const rows = new Map<number, string>();
  let stacksLine: string | undefined;
  for (const line of lines.slice(LEGEND_LINES + 1)) {
    if (line.startsWith('stacks:')) {
      stacksLine = line;
      continue;
    }
    const m = /^([ -]?[ -]?-?\d+) (.*)$/.exec(line);
    if (m === null) continue;
    rows.set(Number((m[1] ?? '').trim()), m[2] ?? '');
  }
  const cell = (row: number, col: number): string => {
    const body = rows.get(row) ?? '';
    const at = 3 * (col - firstCol);
    return body.slice(at, at + 3).padEnd(3, ' ');
  };
  return {
    lines,
    firstCol,
    rows,
    stacksLine,
    cell,
    char: (spot) => cell(spot.row, spot.col)[spot.slot] ?? ' ',
  };
};

/** The glyph the spec's precedence names for one arrow of a board. */
export const expectedGlyph = (board: BoardView, arrow: string): string => {
  const stack = board.groups.find((row) => row.arrow === arrow);
  if (stack !== undefined) return stack.heads >= 10 ? '+' : String(stack.heads);
  for (const [seat, list] of Object.entries(board.trails)) {
    if (list.includes(arrow)) return seat.toUpperCase();
  }
  for (const [seat, list] of Object.entries(board.territory)) {
    if (list.includes(arrow)) return seat.toLowerCase();
  }
  return '.';
};

export const spawnerGlyph = (row: BoardView['spawners'][number]): string => {
  const held = Object.values(row.held).reduce((sum, n) => sum + n, 0);
  return held === 0 ? 'o' : held === 3 ? '#' : '*';
};
