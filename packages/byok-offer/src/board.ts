/**
 * The whole board for the agent seat, and a text map of it (P93).
 *
 * Pure: no clock, no I/O. `boardView` lists every territory arrow, trail
 * arrow, stack and spawner. `boardMap` draws a board on the generated
 * tiling's own layout. `parseBoardView` reads one back from JSON,
 * `parseBoardMap` from its map.
 *
 * @see docs/spec/agent-board-map/agent-board-map.md
 */

import type { GameState, GeometryPort, PlayerId } from '@conquarrow/contracts';
import { ContractViolation, mintArrowId, mintPlayerId, mintVertexId } from '@conquarrow/contracts';
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
const SLOTS = 3;
const MIDDLE = 1;
const RIGHT = 2;
const EMPTY_ARROW = '.';
const OPEN_THIRD = 'o';
/** A point's arrow directions by slot: left = down-left, middle = up, right = down-right. */
const DIRECTION_BY_SLOT = [2, 0, 1] as const;

interface Spot {
  readonly row: number;
  readonly col: number;
  readonly slot: number;
}

const fail = (what: string): never => {
  throw new ContractViolation(`board map: ${what}`);
};

const tiling = makeTiling();
const layout = makeLayout();

/** `+ 0` turns -0 into 0, so a spot is plain data (a row of -0 would not equal 0 in a deep compare). */
const rowOf = (p: Point2): number => Math.round(-2 * p.y) + 0;
const colOf = (x: number): number => Math.round(x / COLUMN_PITCH) + 0;

/** The arrow the stated layout puts at a point-cell slot: row 2i+j, column j. */
const arrowAt = (spot: Spot): string =>
  `tiling:a:${String((spot.row - spot.col) / 2)},${String(spot.col)},${String(DIRECTION_BY_SLOT[spot.slot])}`;

/** The vertex the stated layout puts at a vertex-cell side: up on the right, down on the left. */
const vertexAt = (spot: Spot): string => {
  const i = String((spot.row - spot.col - 1) / 2);
  return spot.slot === RIGHT ? `tiling:v:${i},${String(spot.col)},up` : `tiling:v:${i},${String(spot.col - 1)},down`;
};

/**
 * Where an arrow is drawn: its origin point's cell, in the slot its screen
 * direction names. From the tiling's own layout; refuses an id that is not
 * the canonical id of the arrow drawn there.
 */
export const arrowMapSpot = (id: string): Spot => {
  const arrow = mintArrowId(id);
  const from = layout.pointPosition(tiling.origin(arrow));
  const to = layout.pointPosition(tiling.target(arrow));
  const dx = to.x - from.x;
  // Stryker disable next-line EqualityOperator -- equivalent: dx is 0 or at least √3/2 away from it, never at a bound.
  const slot = Math.abs(dx) < 1e-9 ? MIDDLE : dx < 0 ? 0 : RIGHT;
  const spot = { row: rowOf(from), col: colOf(from.x), slot };
  if (arrowAt(spot) !== id) fail(`${id} is not a canonical arrow id of the tiling`);
  return spot;
};

/** Where a spawner is drawn: the vertex cell its centre rounds into, on the side it leans to. */
export const vertexMapSpot = (id: string): Spot => {
  const at = layout.vertexPosition(mintVertexId(id));
  const exact = at.x / COLUMN_PITCH;
  const col = colOf(at.x);
  // Stryker disable next-line EqualityOperator -- equivalent: a vertex centre is a third off its column, never on it.
  const spot = { row: rowOf(at), col, slot: exact < col ? 0 : RIGHT };
  if (vertexAt(spot) !== id) fail(`${id} is not a canonical vertex id of the tiling`);
  return spot;
};

const SEAT = /^[A-H]$/;

const seat = (value: string, role: string): string =>
  SEAT.test(value) ? value : fail(`${role} ${JSON.stringify(value)} is not a seat letter A-H`);

const whole = (value: number, role: string): number =>
  Number.isInteger(value) ? value : fail(`${role} ${String(value)} is not an integer`);

/** Everything on one arrow, bottom to top. */
interface Layers {
  land?: string;
  readonly trails: string[];
  stack?: BoardGroupRow;
}

const layersOf = (board: BoardView): Map<string, Layers> => {
  const layers = new Map<string, Layers>();
  const at = (arrow: string): Layers => {
    const found = layers.get(arrow);
    if (found !== undefined) return found;
    const fresh: Layers = { trails: [] };
    layers.set(arrow, fresh);
    return fresh;
  };
  for (const [owner, arrows] of Object.entries(board.territory)) {
    for (const arrow of arrows) {
      const here = at(arrow);
      if (here.land !== undefined) fail(`${arrow} is territory twice`);
      here.land = seat(owner, 'territory owner');
    }
  }
  for (const [owner, arrows] of Object.entries(board.trails)) {
    for (const arrow of arrows) {
      const here = at(arrow);
      if (here.trails.includes(owner)) fail(`${arrow} is twice in ${owner}'s trail`);
      here.trails.push(seat(owner, 'trail owner'));
    }
  }
  for (const row of board.groups) {
    const here = at(row.arrow);
    if (here.stack !== undefined) fail(`${row.arrow} has two stacks`);
    seat(row.owner, 'stack owner');
    for (const n of [row.heads, row.spent, row.speed, row.speedOverride ?? 0]) whole(n, `stack on ${row.arrow}:`);
    here.stack = row;
  }
  for (const here of layers.values()) here.trails.sort(byText);
  return layers;
};

/** The top layer: a stack as seat and exact heads, else the first trail, else territory, else `.`. */
const glyphOf = (here: Layers): string => {
  if (here.stack !== undefined) return `${here.stack.owner}${String(here.stack.heads)}`;
  // Stryker disable next-line OptionalChaining -- equivalent: an arrow with no stack and no trail is listed for its territory, so land is set.
  return here.trails[0] ?? here.land?.toLowerCase() ?? EMPTY_ARROW;
};

/** What the glyph hides, bottom first: territory lower case, then trails upper case. */
const underOf = (here: Layers): string => {
  const land = here.land?.toLowerCase() ?? '';
  if (here.stack !== undefined) return land + here.trails.join('');
  return here.trails.length === 0 ? '' : land + here.trails.slice(1).join('');
};

const FORCE = /^\d+\/\d+$/;

/** Holder letters per held third (seats in letter order), `o` per unclaimed third, then the force. */
const spawnerLabel = (row: BoardSpawnerRow): string => {
  let thirds = '';
  for (const holder of Object.keys(row.held).sort(byText)) {
    const n = row.held[holder] ?? 0;
    if (!Number.isInteger(n) || n < 1) fail(`spawner ${row.vertex} holds ${String(n)} for ${holder}`);
    thirds += seat(holder, 'spawner holder').toLowerCase().repeat(n);
  }
  const { unclaimed } = row;
  if (!Number.isInteger(unclaimed) || unclaimed < 0 || thirds.length + unclaimed !== SLOTS) {
    fail(`spawner ${row.vertex} has held and unclaimed that do not make 3 thirds`);
  }
  if (!FORCE.test(row.force)) fail(`spawner ${row.vertex} force ${row.force} is not n/d`);
  const force = row.force.startsWith('1/') ? row.force.slice(2) : row.force;
  return thirds + OPEN_THIRD.repeat(unclaimed) + force;
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

const emptyGrid = (): Grid => ({
  marks: new Map(),
  rows: { min: Infinity, max: -Infinity },
  cols: { min: Infinity, max: -Infinity },
});

// Stryker disable next-line ArithmeticOperator -- equivalent: row - col and row + col have the same parity.
const isPointCell = (row: number, col: number): boolean => (row - col) % 2 === 0;

interface Widths {
  /** Characters per column. */
  readonly cell: number;
  /** Characters per arrow slot. */
  readonly slot: number;
}

/** The left part of a vertex cell; a space and the right part follow. */
const leftPart = (widths: Widths): number => Math.floor((widths.cell - 1) / 2);

/** Spaces before a point cell's three slots. */
const pointPad = (widths: Widths): number => Math.floor((widths.cell - SLOTS * widths.slot - 2) / 2);

const cellText = (grid: Grid, widths: Widths, row: number, col: number): string => {
  const cell = grid.marks.get(keyOf(row, col)) ?? ['', '', ''];
  if (!isPointCell(row, col)) {
    const left = leftPart(widths);
    return `${(cell[0] ?? '').padEnd(left)} ${(cell[RIGHT] ?? '').padStart(widths.cell - 1 - left)}`;
  }
  const slots = cell.map((glyph) => (glyph === '' ? EMPTY_ARROW : glyph).padEnd(widths.slot)).join(' ');
  const pad = pointPad(widths);
  return ' '.repeat(pad) + slots + ' '.repeat(widths.cell - pad - slots.length);
};

const range = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let n = from; n <= to; n += 1) out.push(n);
  return out;
};

const gridLines = (grid: Grid, widths: Widths): string[] => {
  const cols = range(grid.cols.min, grid.cols.max);
  const label = (col: number): string =>
    String(col).padStart(Math.floor(widths.cell / 2) + 1).padEnd(widths.cell);
  const lines = [`    ${cols.map(label).join('')}`.trimEnd()];
  for (const row of range(grid.rows.min, grid.rows.max).reverse()) {
    const cells = cols.map((col) => cellText(grid, widths, row, col)).join('');
    lines.push(`${String(row).padStart(3)} ${cells}`.trimEnd());
  }
  return lines;
};

const stackLines = (board: BoardView): string[] => {
  const rows = [...board.groups].sort((a, b) => byText(a.owner, b.owner) || byText(a.arrow, b.arrow));
  if (rows.length === 0) return ['stacks: none'];
  return rows.map((row) => {
    const override = row.speedOverride === undefined ? '' : ` override ${String(row.speedOverride)}`;
    const fields = `spent ${String(row.spent)} speed ${String(row.speed)}${override}`;
    return `stack ${row.owner}${String(row.heads)} ${row.arrow} ${fields}`;
  });
};

const underLines = (layers: ReadonlyMap<string, Layers>): string[] => {
  const lines = [...layers]
    .sort(([a], [b]) => byText(a, b))
    .flatMap(([arrow, here]) => {
      const hidden = underOf(here);
      return hidden === '' ? [] : [`under ${arrow} ${hidden}`];
    });
  return lines.length === 0 ? ['under: none'] : lines;
};

/**
 * The map legend: the one text the map prints under its header, the MCP
 * `board` description quotes, and the BYOK system prompt quotes (P93
 * decision 15). The widths depend on the board, so they are on the map's
 * header line, not here.
 */
export const MAP_LEGEND: readonly string[] = [
  'rows: point (i,j) is row 2i+j, up is larger; columns: j. The header gives the characters per column and per arrow slot.',
  'point cell (centred in its column): three arrow slots, one space apart: down-left arrow (tiling:a:i,j,2), up (tiling:a:i,j,0), down-right (tiling:a:i,j,1).',
  "arrow slot, its top layer: B3 = seat B's stack of 3 heads (seat letter, then the exact count), else A-H = that seat's trail, else a-h = that seat's territory, else . = none.",
  'spawner, between point cells: its three thirds, then its force. Thirds: a holder letter (a-h) per third that seat holds, o per unclaimed third. Force: d for force 1/d, else n/d (ooo5 = open, force 1/5; bbo2/7 = b holds two thirds, one unclaimed, force 2/7).',
  'after the grid: "stack B3 <arrow> spent <n> speed <n>" per stack (" override <n>" when set), then "under <arrow> <layers>" per arrow whose slot hides layers, bottom first: a-h territory, then A-H trails.',
];

/**
 * The board as a text map on the generated tiling's layout. Every fact of
 * the board is in it: `parseBoardMap` reads it back (P93 decision 16).
 *
 * @throws ContractViolation for a board the map cannot draw exactly: an id
 *   that is not a canonical arrow or vertex id of the tiling, a seat that is
 *   not one letter A-H, an arrow or vertex listed twice, a spawner whose
 *   thirds do not make 3, a force that is not n/d.
 */
export const boardMap = (board: BoardView): string => {
  const players = board.players.map((player) => seat(player, 'player'));
  const me = seat(board.me, 'me');
  const active = seat(board.activePlayer, 'active player');
  const layers = layersOf(board);
  const grid = emptyGrid();
  let slot = 1;
  for (const [arrow, here] of layers) {
    const glyph = glyphOf(here);
    slot = Math.max(slot, glyph.length);
    mark(grid, arrowMapSpot(arrow), glyph);
  }
  let label = 0;
  const vertices = new Set<string>();
  for (const row of board.spawners) {
    if (vertices.has(row.vertex)) fail(`${row.vertex} is listed twice`);
    vertices.add(row.vertex);
    const text = spawnerLabel(row);
    label = Math.max(label, text.length);
    mark(grid, vertexMapSpot(row.vertex), text);
  }
  const widths = { cell: Math.max(SLOTS * slot + 2, 2 * label + 1), slot };
  const header =
    `map me=${me} active=${active} players=${players.join(',')}; ` +
    `${String(widths.cell)} characters per column, ${String(slot)} per arrow.`;
  return [header, ...MAP_LEGEND, ...gridLines(grid, widths), ...stackLines(board), ...underLines(layers)].join('\n') + '\n';
};

// ---------------------------------------------------------------------------
// Reading a map back
// ---------------------------------------------------------------------------

const HEADER =
  /^map me=([A-H]) active=([A-H]) players=((?:[A-H](?:,[A-H])*)?); (\d+) characters per column, (\d+) per arrow\.$/;
/** A row label, then its cells; a row of empty vertex cells is trimmed to its label. */
const ROW_LINE = /^ *(-?\d+)(?: (.*))?$/;
const STACK_LINE = /^stack ([A-H])(-?\d+) (\S+) spent (-?\d+) speed (-?\d+)(?: override (-?\d+))?$/;
const UNDER_LINE = /^under (\S+) ([a-hA-H]+)$/;
const LABEL = /^([a-h]*)(o*)(\d+(?:\/\d+)?)$/;
const TERRITORY_GLYPH = /^[a-h]$/;
const TRAIL_GLYPH = /^[A-H]$/;
const STACK_GLYPH = /^[A-H]-?\d+$/;

interface Read {
  readonly territory: [string, string][];
  readonly trails: [string, string][];
  readonly groups: BoardGroupRow[];
  readonly spawners: BoardSpawnerRow[];
}

/** One layer letter: lower case is territory, upper case a trail. */
const readLayer = (read: Read, arrow: string, letter: string): void => {
  if (TERRITORY_GLYPH.test(letter)) read.territory.push([letter.toUpperCase(), arrow]);
  else read.trails.push([letter, arrow]);
};

const readSlot = (read: Read, arrow: string, glyph: string): void => {
  if (glyph === EMPTY_ARROW || STACK_GLYPH.test(glyph)) return;
  if (TERRITORY_GLYPH.test(glyph) || TRAIL_GLYPH.test(glyph)) readLayer(read, arrow, glyph);
  else fail(`slot glyph ${JSON.stringify(glyph)} at ${arrow} is not a glyph`);
};

const readLabel = (read: Read, vertex: string, label: string): void => {
  // No match leaves no thirds, so the count check refuses it too.
  const [, holders = '', open = '', force = ''] = LABEL.exec(label) ?? [];
  if (holders.length + open.length !== SLOTS) fail(`spawner label ${JSON.stringify(label)} is not a label`);
  const held: Record<string, number> = {};
  for (const letter of holders) held[letter.toUpperCase()] = (held[letter.toUpperCase()] ?? 0) + 1;
  read.spawners.push({ vertex, force: force.includes('/') ? force : `1/${force}`, held, unclaimed: open.length });
};

const readRow = (read: Read, widths: Widths, firstCol: number, row: number, body: string): void => {
  const pad = pointPad(widths);
  const left = leftPart(widths);
  for (let at = 0; at < body.length; at += widths.cell) {
    const cell = body.slice(at, at + widths.cell).padEnd(widths.cell);
    const col = firstCol + at / widths.cell;
    if (isPointCell(row, col)) {
      for (const slot of [0, MIDDLE, RIGHT]) {
        const from = pad + slot * (widths.slot + 1);
        readSlot(read, arrowAt({ row, col, slot }), cell.slice(from, from + widths.slot).trim());
      }
      continue;
    }
    const sides = [cell.slice(0, left).trim(), '', cell.slice(left + 1).trim()];
    for (const slot of [0, RIGHT]) {
      const label = sides[slot] ?? '';
      if (label !== '') readLabel(read, vertexAt({ row, col, slot }), label);
    }
  }
};

const readStack = (read: Read, m: RegExpExecArray): void => {
  const [, owner = '', heads = '', arrow = '', spent = '', speed = '', override] = m;
  const row = { arrow, owner, heads: Number(heads), spent: Number(spent), speed: Number(speed) };
  read.groups.push(override === undefined ? row : { ...row, speedOverride: Number(override) });
};

const readFooter = (read: Read, line: string): void => {
  const stack = STACK_LINE.exec(line);
  if (stack !== null) {
    readStack(read, stack);
    return;
  }
  const under = UNDER_LINE.exec(line);
  if (under === null) {
    fail(`line ${JSON.stringify(line)} is not a map line`);
    return;
  }
  const [, arrow = '', letters = ''] = under;
  for (const letter of letters) readLayer(read, arrow, letter);
};

const FOOTER_EMPTY = new Set(['stacks: none', 'under: none', '']);

/**
 * Read a map back to its board, from the stated layout alone (row 2i+j,
 * column j, the slot order and the vertex-cell sides), normalized: one key
 * per seat in `players` order then other owners, lists sorted, `groups` by
 * arrow, `spawners` by vertex.
 *
 * @throws ContractViolation for text that is not a map.
 */
interface Header {
  readonly me: string;
  readonly activePlayer: string;
  readonly players: string[];
  readonly widths: Widths;
}

const readHeader = (line: string): Header => {
  const header = HEADER.exec(line);
  if (header === null) return fail('the text does not start with a map header');
  const [, me = '', activePlayer = '', seats = '', cell = '', slot = ''] = header;
  const players = seats === '' ? [] : seats.split(',');
  return { me, activePlayer, players, widths: { cell: Number(cell), slot: Number(slot) } };
};

export const parseBoardMap = (text: string): BoardView => {
  const lines = text.split('\n');
  const { me, activePlayer, players, widths } = readHeader(lines[0] ?? '');
  const labelsAt = 1 + MAP_LEGEND.length;
  const firstCol = Number(/-?\d+/.exec(lines[labelsAt] ?? '')?.[0] ?? 0);
  const read: Read = { territory: [], trails: [], groups: [], spawners: [] };
  for (const line of lines.slice(labelsAt + 1)) {
    if (FOOTER_EMPTY.has(line)) continue;
    const row = ROW_LINE.exec(line);
    if (row === null) readFooter(read, line);
    else readRow(read, widths, firstCol, Number(row[1]), row[2] ?? '');
  }
  const ids = players.map(mintPlayerId);
  return {
    me,
    players,
    activePlayer,
    territory: listsBySeat(ids, read.territory),
    trails: listsBySeat(ids, read.trails),
    groups: read.groups.sort((a, b) => byText(a.arrow, b.arrow)),
    spawners: read.spawners.sort((a, b) => byText(a.vertex, b.vertex)),
  };
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
