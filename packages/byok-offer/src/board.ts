/**
 * The whole board for the agent seat, and a text map of it (P93).
 *
 * Pure: no clock, no I/O. `boardView` lists every territory arrow, trail
 * arrow, stack and spawner. `boardMap` draws a board on the generated
 * tiling's own layout. `parseBoardView` reads one back from JSON.
 *
 * @see docs/spec/agent-board-map/agent-board-map.md
 */

import type { GameState, GeometryPort, PlayerId } from '@conquarrow/contracts';
import { mintArrowId, mintVertexId } from '@conquarrow/contracts';
import { makeLayout, makeTiling, type Point2 } from '@conquarrow/geometry-tiling';
import { groupRows, spawnerEntries, spawnerRow, type GroupRow, type SpawnerRow } from './prompt';

/** One stack. Same row as `STATE_JSON.groups`. */
export type BoardGroupRow = GroupRow;

/** One spawner. Same row as `STATE_JSON.spawners`. */
export type BoardSpawnerRow = SpawnerRow;

/** The `board` that `board: "json"` or `"both"` returns beside the offer. */
export interface BoardView {
  readonly me: string;
  readonly players: readonly string[];
  readonly activePlayer: string;
  readonly territory: Readonly<Record<string, readonly string[]>>;
  readonly trails: Readonly<Record<string, readonly string[]>>;
  readonly groups: readonly BoardGroupRow[];
  readonly spawners: readonly BoardSpawnerRow[];
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** One key per seat in `players` order, then any other owner in id order, each list sorted. */
const listsBySeat = (
  players: readonly PlayerId[],
  entries: Iterable<readonly [string, string]>,
): Record<string, string[]> => {
  const found = new Map<string, string[]>();
  for (const [owner, arrow] of entries) {
    const list = found.get(owner);
    if (list === undefined) found.set(owner, [arrow]);
    else list.push(arrow);
  }
  const seats = players.map(String);
  const others = [...found.keys()].filter((owner) => !seats.includes(owner)).sort(byText);
  const lists: Record<string, string[]> = {};
  for (const owner of [...seats, ...others]) lists[owner] = (found.get(owner) ?? []).sort(byText);
  return lists;
};

export const boardView = (geometry: GeometryPort, state: GameState, me: PlayerId): BoardView => ({
  me: String(me),
  players: state.players.map(String),
  activePlayer: String(state.activePlayer),
  territory: listsBySeat(
    state.players,
    [...state.territory].map(([arrow, owner]) => [String(owner), String(arrow)] as const),
  ),
  trails: listsBySeat(
    state.players,
    [...state.trails].flatMap(([owner, arrows]) =>
      [...arrows].map((arrow) => [String(owner), String(arrow)] as const),
    ),
  ),
  groups: groupRows(state),
  spawners: spawnerEntries(state).map(([vertex, spawner]) => spawnerRow(geometry, state, vertex, spawner)),
});

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

/** Layout x between neighbouring point columns: `√3/2` (P03 `world`). */
const COLUMN_PITCH = Math.sqrt(3) / 2;
/** Characters a point cell's three arrows take. The narrowest cell. */
const ARROWS = 3;
const MIDDLE = 1;
const RIGHT = 2;
const EMPTY_ARROW = '.';

interface Spot {
  readonly row: number;
  readonly col: number;
  readonly slot: number;
}

const rowOf = (p: Point2): number => Math.round(-2 * p.y);

/** An arrow sits in its origin point's cell, in the slot its screen direction names. */
const arrowSpotter = (geometry: GeometryPort, layout: ReturnType<typeof makeLayout>) =>
  (id: string): Spot => {
    const arrow = mintArrowId(id);
    const from = layout.pointPosition(geometry.origin(arrow));
    const to = layout.pointPosition(geometry.target(arrow));
    const dx = to.x - from.x;
    // Stryker disable next-line EqualityOperator -- equivalent: dx is 0 or at least √3/2 away from it, never at a bound.
    const slot = Math.abs(dx) < 1e-9 ? MIDDLE : dx < 0 ? 0 : RIGHT;
    return { row: rowOf(from), col: Math.round(from.x / COLUMN_PITCH), slot };
  };

/** A spawner sits in the vertex cell its centre rounds into, on the side it leans to. */
const vertexSpotter = (layout: ReturnType<typeof makeLayout>) =>
  (id: string): Spot => {
    const at = layout.vertexPosition(mintVertexId(id));
    const exact = at.x / COLUMN_PITCH;
    const col = Math.round(exact);
    // Stryker disable next-line EqualityOperator -- equivalent: a vertex centre is a third off its column, never on it.
    return { row: rowOf(at), col, slot: exact < col ? 0 : RIGHT };
  };

const spawnerGlyph = (row: BoardSpawnerRow): string => {
  const held = Object.values(row.held).reduce((sum, n) => sum + n, 0);
  if (held === 0) return 'o';
  return held >= 3 ? '#' : '*';
};

/** `d` for a `1/d` force, else the force as written. */
const forceText = (force: string): string => (force.startsWith('1/') ? force.slice(2) : force);

/** The held glyph, then the force from its fraction: `o5` (open, 1/5), `#2/7` (all held, 2/7). */
const spawnerLabel = (row: BoardSpawnerRow): string => spawnerGlyph(row) + forceText(row.force);

const headsGlyph = (heads: number): string => (heads >= 10 ? '+' : String(heads));

/** Arrow glyphs, written in precedence order: territory, then trail, then stack. */
const arrowGlyphs = (board: BoardView): Map<string, string> => {
  const glyphs = new Map<string, string>();
  const paint = (lists: BoardView['territory'], cased: (seat: string) => string): void => {
    for (const seat of Object.keys(lists).sort(byText)) {
      for (const arrow of lists[seat] ?? []) glyphs.set(arrow, cased(seat));
    }
  };
  paint(board.territory, (seat) => seat.toLowerCase());
  paint(board.trails, (seat) => seat.toUpperCase());
  for (const row of [...board.groups].sort((a, b) => byText(a.arrow, b.arrow))) {
    glyphs.set(row.arrow, headsGlyph(row.heads));
  }
  return glyphs;
};

interface Grid {
  /** Point cells: the three arrow glyphs. Vertex cells: the left and right spawner labels. */
  readonly marks: Map<string, string[]>;
  readonly rows: { min: number; max: number };
  readonly cols: { min: number; max: number };
}

const keyOf = (row: number, col: number): string => `${String(row)},${String(col)}`;

const mark = (grid: Grid, spot: Spot, text: string): void => {
  const key = keyOf(spot.row, spot.col);
  const cell = grid.marks.get(key) ?? ['', '', ''];
  cell[spot.slot] = text;
  grid.marks.set(key, cell);
  grid.rows.min = Math.min(grid.rows.min, spot.row);
  grid.rows.max = Math.max(grid.rows.max, spot.row);
  grid.cols.min = Math.min(grid.cols.min, spot.col);
  grid.cols.max = Math.max(grid.cols.max, spot.col);
};

const gridOf = (board: BoardView): Grid => {
  const geometry = makeTiling();
  const layout = makeLayout();
  const arrowSpot = arrowSpotter(geometry, layout);
  const vertexSpot = vertexSpotter(layout);
  const grid: Grid = {
    marks: new Map(),
    rows: { min: Infinity, max: -Infinity },
    cols: { min: Infinity, max: -Infinity },
  };
  for (const [arrow, glyph] of arrowGlyphs(board)) mark(grid, arrowSpot(arrow), glyph);
  for (const row of board.spawners) mark(grid, vertexSpot(row.vertex), spawnerLabel(row));
  return grid;
};

/** 3, or wide enough for the longest spawner label on each side of a vertex cell. */
const cellWidth = (board: BoardView): number => {
  const longest = Math.max(0, ...board.spawners.map((row) => spawnerLabel(row).length));
  return Math.max(ARROWS, 2 * longest + 1);
};

// Stryker disable next-line ArithmeticOperator -- equivalent: row - col and row + col have the same parity.
const isPointCell = (row: number, col: number): boolean => (row - col) % 2 === 0;

const cellText = (grid: Grid, width: number, row: number, col: number): string => {
  const cell = grid.marks.get(keyOf(row, col)) ?? ['', '', ''];
  if (!isPointCell(row, col)) {
    const side = (width - 1) / 2;
    return `${(cell[0] ?? '').padEnd(side)} ${(cell[RIGHT] ?? '').padStart(side)}`;
  }
  const pad = ' '.repeat((width - ARROWS) / 2);
  return pad + cell.map((glyph) => (glyph === '' ? EMPTY_ARROW : glyph)).join('') + pad;
};

const columns = (grid: Grid): number[] => {
  const cols: number[] = [];
  for (let col = grid.cols.min; col <= grid.cols.max; col += 1) cols.push(col);
  return cols;
};

const gridLines = (grid: Grid, width: number): string[] => {
  const cols = columns(grid);
  const label = (col: number): string => String(col).padStart(Math.floor(width / 2) + 1).padEnd(width);
  const lines = [`    ${cols.map(label).join('')}`.trimEnd()];
  for (let row = grid.rows.max; row >= grid.rows.min; row -= 1) {
    const cells = cols.map((col) => cellText(grid, width, row, col)).join('');
    lines.push(`${String(row).padStart(3)} ${cells}`.trimEnd());
  }
  return lines;
};

const stacksLine = (board: BoardView): string => {
  const rows = [...board.groups].sort((a, b) => byText(a.owner, b.owner) || byText(a.arrow, b.arrow));
  if (rows.length === 0) return 'stacks: none';
  return `stacks: ${rows.map((row) => `${row.owner}${String(row.heads)} ${row.arrow}`).join('; ')}`;
};

/**
 * The map legend: the one text the map prints under its header, the MCP
 * `board` description quotes, and the BYOK system prompt quotes (P93
 * decision 15). The column width depends on the board, so it is on the
 * map's header line, not here.
 */
export const MAP_LEGEND: readonly string[] = [
  'rows: point (i,j) is row 2i+j, up is larger; columns: j.',
  'point cell xyz (centred in its column): x = down-left arrow (tiling:a:i,j,2), y = up (tiling:a:i,j,0), z = down-right (tiling:a:i,j,1).',
  'arrow: 1-9 stack heads (+ for 10 or more), A-H trail, a-h territory, . none.',
  'spawner, between point cells: o open, * part held, # all held, then its force: d for force 1/d, else n/d (o5 = open, force 1/5; #2/7 = all held, force 2/7).',
];

/**
 * The board as a text map on the generated tiling's layout.
 *
 * @throws ContractViolation for an id that is not an arrow or vertex of the tiling.
 */
export const boardMap = (board: BoardView): string => {
  const grid = gridOf(board);
  const width = cellWidth(board);
  return [
    `map me=${board.me} active=${board.activePlayer}; ${String(width)} characters per column.`,
    ...MAP_LEGEND,
    ...gridLines(grid, width),
    stacksLine(board),
  ].join('\n') + '\n';
};

// ---------------------------------------------------------------------------
// Reading a board back
// ---------------------------------------------------------------------------

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const isText = (value: unknown): value is string => typeof value === 'string';

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

const textLists = (value: unknown): Record<string, string[]> | undefined => {
  const rec = asRecord(value);
  if (rec === undefined) return undefined;
  const out: Record<string, string[]> = {};
  for (const [key, list] of Object.entries(rec)) {
    if (!Array.isArray(list) || !list.every(isText)) return undefined;
    out[key] = [...list];
  }
  return out;
};

const groupRowOf = (value: unknown): BoardGroupRow | undefined => {
  const rec = asRecord(value);
  if (rec === undefined || !isText(rec['arrow']) || !isText(rec['owner'])) return undefined;
  const { heads, spent, speed, speedOverride } = rec;
  if (!isCount(heads) || !isCount(spent) || !isCount(speed)) return undefined;
  const base = { arrow: rec['arrow'], owner: rec['owner'], heads, spent, speed };
  return isCount(speedOverride) ? { ...base, speedOverride } : base;
};

const spawnerRowOf = (value: unknown): BoardSpawnerRow | undefined => {
  const rec = asRecord(value);
  const held = asRecord(rec?.['held']);
  if (rec === undefined || held === undefined) return undefined;
  if (!isText(rec['vertex']) || !isText(rec['force']) || !isCount(rec['unclaimed'])) return undefined;
  if (!Object.values(held).every(isCount)) return undefined;
  return {
    vertex: rec['vertex'],
    force: rec['force'],
    held: { ...(held as Record<string, number>) },
    unclaimed: rec['unclaimed'],
  };
};

const rowsOf = <T>(value: unknown, read: (row: unknown) => T | undefined): T[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const rows: T[] = [];
  for (const entry of value) {
    const row = read(entry);
    if (row === undefined) return undefined;
    rows.push(row);
  }
  return rows;
};

/** A board, or an observe result with a `board` key. Anything else is `undefined`. */
export const parseBoardView = (json: unknown): BoardView | undefined => {
  const outer = asRecord(json);
  const rec = asRecord(outer?.['board']) ?? outer;
  if (rec === undefined || !isText(rec['me']) || !isText(rec['activePlayer'])) return undefined;
  const players = rec['players'];
  if (!Array.isArray(players) || !players.every(isText)) return undefined;
  const territory = textLists(rec['territory']);
  const trails = textLists(rec['trails']);
  const groups = rowsOf(rec['groups'], groupRowOf);
  const spawners = rowsOf(rec['spawners'], spawnerRowOf);
  if (territory === undefined || trails === undefined) return undefined;
  if (groups === undefined || spawners === undefined) return undefined;
  return { me: rec['me'], players: [...players], activePlayer: rec['activePlayer'], territory, trails, groups, spawners };
};
