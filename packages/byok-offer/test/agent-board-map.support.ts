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
  /** Characters per arrow slot, from the header. */
  readonly slotWidth: number;
  readonly firstCol: number;
  readonly rows: ReadonlyMap<number, string>;
  /** The `stack …` lines, or `['stacks: none']`. */
  readonly stackLines: readonly string[];
  /** The `under …` lines, or `['under: none']`. */
  readonly underLines: readonly string[];
  cell(row: number, col: number): string;
  /** The glyph in a point-cell slot (left, middle, right), trimmed. */
  slot(spot: { row: number; col: number; slot: number }): string;
  /** The spawner label on one side of a vertex cell (slot 0 left, slot 2 right), trimmed. */
  label(spot: { row: number; col: number; slot: number }): string;
}

const LABELS = /^\s*-?\d+(\s+-?\d+)*$/;
const ROW = /^([ -]?[ -]?-?\d+) (.*)$/;

/** Read a map back by the spec's line order: header, legend, column labels, rows, stack and under lines. */
export const readMap = (text: string): ReadMap => {
  const lines = text.split('\n');
  const header = /(\d+) characters per column, (\d+) per arrow/.exec(lines[0] ?? '');
  if (header === null) throw new Error('test oracle: the header names no widths');
  const width = Number(header[1]);
  const slotWidth = Number(header[2]);
  const labelsAt = lines.findIndex((line) => LABELS.test(line));
  if (labelsAt < 0) throw new Error('test oracle: no column labels line');
  const firstCol = Number(/-?\d+/.exec(lines[labelsAt] ?? '')?.[0]);
  const rows = new Map<number, string>();
  const stackLines: string[] = [];
  const underLines: string[] = [];
  for (const line of lines.slice(labelsAt + 1)) {
    if (line.startsWith('stack')) {
      stackLines.push(line);
      continue;
    }
    if (line.startsWith('under')) {
      underLines.push(line);
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
  const pad = Math.floor((width - 3 * slotWidth - 2) / 2);
  const left = Math.floor((width - 1) / 2);
  return {
    lines,
    width,
    slotWidth,
    firstCol,
    rows,
    stackLines,
    underLines,
    cell,
    slot: (spot) => {
      const at = pad + spot.slot * (slotWidth + 1);
      return cell(spot.row, spot.col).slice(at, at + slotWidth).trim();
    },
    label: (spot) => {
      const body = cell(spot.row, spot.col);
      return (spot.slot === 0 ? body.slice(0, left) : body.slice(left + 1)).trim();
    },
  };
};

const seatsHolding = (lists: BoardView['territory'], arrow: string): string[] =>
  Object.entries(lists)
    .filter(([, list]) => list.includes(arrow))
    .map(([seat]) => seat)
    .sort();

/** The glyph the spec's precedence names for one arrow of a board. */
export const expectedGlyph = (board: BoardView, arrow: string): string => {
  const stack = board.groups.find((row) => row.arrow === arrow);
  if (stack !== undefined) return `${stack.owner}${String(stack.heads)}`;
  const trail = seatsHolding(board.trails, arrow)[0];
  if (trail !== undefined) return trail.toUpperCase();
  const land = seatsHolding(board.territory, arrow)[0];
  return land === undefined ? '.' : land.toLowerCase();
};

/** The layers the spec says hide under an arrow's glyph, bottom first; '' when none. */
export const expectedUnder = (board: BoardView, arrow: string): string => {
  const land = seatsHolding(board.territory, arrow).map((seat) => seat.toLowerCase());
  const trails = seatsHolding(board.trails, arrow);
  const stacked = board.groups.some((row) => row.arrow === arrow);
  if (stacked) return [...land, ...trails].join('');
  return trails.length === 0 ? '' : [...land, ...trails.slice(1)].join('');
};

/** The spawner label the spec names: a holder letter per held third, o per open third, then the force. */
export const spawnerLabel = (row: BoardView['spawners'][number]): string => {
  const thirds = Object.keys(row.held)
    .sort()
    .map((seat) => seat.toLowerCase().repeat(row.held[seat] ?? 0))
    .join('');
  return thirds + 'o'.repeat(row.unclaimed) + (row.force.startsWith('1/') ? row.force.slice(2) : row.force);
};
