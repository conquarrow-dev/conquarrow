/**
 * Shared fixtures for docs/spec/agent-board-map — the rebuilt smoke-test game,
 * a small board builder, and a map reader that uses the spec's stated layout
 * (row 2i+j, column j, W characters per column, arrows centred, spawner labels
 * at the cell's sides) as an independent oracle.
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
export const FIXTURE_BOARD = join(here, 'fixtures', 'smoke-2026-11-14.board.json');

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
  readonly width: number;
  readonly firstCol: number;
  readonly rows: ReadonlyMap<number, string>;
  readonly stacksLine: string | undefined;
  cell(row: number, col: number): string;
  /** The arrow character at a point-cell slot (left, middle, right of the centred three). */
  char(spot: { row: number; col: number; slot: number }): string;
  /** The spawner label on one side of a vertex cell (slot 0 left, slot 2 right), trimmed. */
  label(spot: { row: number; col: number; slot: number }): string;
}

const LABELS = /^\s*-?\d+(\s+-?\d+)*$/;
const ROW = /^([ -]?[ -]?-?\d+) (.*)$/;

/** Read a map back by the spec's line order: header, legend, column labels, rows, stacks. */
export const readMap = (text: string): ReadMap => {
  const lines = text.split('\n');
  const widthMatch = /(\d+) characters per column/.exec(text);
  if (widthMatch === null) throw new Error('test oracle: the legend names no column width');
  const width = Number(widthMatch[1]);
  const labelsAt = lines.findIndex((line) => LABELS.test(line));
  if (labelsAt < 0) throw new Error('test oracle: no column labels line');
  const firstCol = Number(/-?\d+/.exec(lines[labelsAt] ?? '')?.[0]);
  const rows = new Map<number, string>();
  let stacksLine: string | undefined;
  for (const line of lines.slice(labelsAt + 1)) {
    if (line.startsWith('stacks:')) {
      stacksLine = line;
      continue;
    }
    const m = ROW.exec(line);
    if (m === null) continue;
    rows.set(Number((m[1] ?? '').trim()), m[2] ?? '');
  }
  const cell = (row: number, col: number): string => {
    const body = rows.get(row) ?? '';
    const at = width * (col - firstCol);
    return body.slice(at, at + width).padEnd(width, ' ');
  };
  const pad = (width - 3) / 2;
  const side = (width - 1) / 2;
  return {
    lines,
    width,
    firstCol,
    rows,
    stacksLine,
    cell,
    char: (spot) => cell(spot.row, spot.col)[pad + spot.slot] ?? ' ',
    label: (spot) => {
      const body = cell(spot.row, spot.col);
      return (spot.slot === 0 ? body.slice(0, side) : body.slice(width - side)).trim();
    },
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

/** The spawner label the spec names: held glyph, then d for a 1/d force, else the force. */
export const spawnerLabel = (row: BoardView['spawners'][number]): string =>
  spawnerGlyph(row) + (row.force.startsWith('1/') ? row.force.slice(2) : row.force);
