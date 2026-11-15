/**
 * docs/spec/agent-board-map/agent-board-map.edge-cases.feature — board and map
 * boundaries. The observe outlines live in packages/online-api/test.
 *
 * @see docs/spec/agent-board-map/agent-board-map.md
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { ContractViolation, type ArrowId, type GameState } from '@conquarrow/contracts';
import { boardMap, boardView, parseBoardMap, parseBoardView } from '../src/board';
import {
  arrowSpot,
  geometry,
  group,
  opening,
  readMap,
  repoRoot,
  smallBoard,
  vertexSpot,
} from './agent-board-map.support';

const noTerritoryFor = (state: GameState, seat: string): GameState => ({
  ...state,
  territory: new Map([...state.territory].filter(([, owner]) => String(owner) !== seat)),
  trails: new Map([...state.trails].filter(([owner]) => String(owner) !== seat)),
});

describe('The board is whole where the offer is capped', () => {
  it('A seat with no territory or trail still has its keys', () => {
    const state = noTerritoryFor(opening(3), 'A');
    const me = state.players[1];
    if (me === undefined) throw new Error('setup: no seat B');

    const board = boardView(geometry, state, me);

    expect(board.territory['A']).toEqual([]);
    expect(board.trails['A']).toEqual([]);
    expect(Object.keys(board.territory)).toEqual(['A', 'B', 'C']);
    expect(Object.keys(board.trails)).toEqual(['A', 'B', 'C']);
  });

  it('An owner that is not in players is listed after the seats', () => {
    const base = opening(3);
    const me = base.players[1];
    if (me === undefined) throw new Error('setup: no seat B');
    const z = 'Z' as unknown as GameState['activePlayer'];
    const t1 = 'tiling:a:9,9,0' as unknown as ArrowId;
    const t2 = 'tiling:a:9,9,1' as unknown as ArrowId;
    const state: GameState = {
      ...base,
      territory: new Map([...base.territory, [t1, z]]),
      trails: new Map([...base.trails, [z, new Set([t2])]]),
    };

    const board = boardView(geometry, state, me);

    expect(Object.keys(board.territory)).toEqual(['A', 'B', 'C', 'Z']);
    expect(board.territory['Z']).toEqual(['tiling:a:9,9,0']);
    expect(Object.keys(board.trails)).toEqual(['A', 'B', 'C', 'Z']);
    expect(board.trails['Z']).toEqual(['tiling:a:9,9,1']);
  });
});

describe('Glyph precedence and limits', () => {
  it('A stack shows its owner and heads, and an under line lists what it hides', () => {
    const board = smallBoard({
      players: ['A', 'B', 'C'],
      territory: { A: ['tiling:a:0,0,0', 'tiling:a:0,0,1'], B: [], C: [] },
      trails: { A: [], B: ['tiling:a:0,0,0', 'tiling:a:0,0,1'], C: [] },
      groups: [group('tiling:a:0,0,0', 'C', 3)],
    });

    const map = readMap(boardMap(board));

    expect(map.slot(arrowSpot('tiling:a:0,0,0'))).toBe('C3');
    expect(map.slot(arrowSpot('tiling:a:0,0,1'))).toBe('B');
    expect(map.underLines).toEqual(['under tiling:a:0,0,0 aB', 'under tiling:a:0,0,1 a']);
  });

  it("Two seats' trails on one arrow show the first seat and list the other", () => {
    const board = smallBoard({
      players: ['A', 'B', 'C'],
      territory: { A: [], B: [], C: [] },
      trails: { A: ['tiling:a:0,0,0'], B: [], C: ['tiling:a:0,0,0'] },
    });

    const map = readMap(boardMap(board));

    expect(map.slot(arrowSpot('tiling:a:0,0,0'))).toBe('A');
    expect(map.underLines).toEqual(['under tiling:a:0,0,0 C']);
  });

  it('A stack of 10 or more heads shows its exact count and widens the slots', () => {
    const board = smallBoard({
      territory: { A: [], B: ['tiling:a:0,0,0', 'tiling:a:0,0,1'] },
      groups: [group('tiling:a:0,0,0', 'A', 10), group('tiling:a:0,0,1', 'B', 9)],
    });

    const map = readMap(boardMap(board));

    expect(map.slotWidth).toBe(3);
    expect(map.slot(arrowSpot('tiling:a:0,0,0'))).toBe('A10');
    expect(map.slot(arrowSpot('tiling:a:0,0,1'))).toBe('B9');
    expect(map.stackLines).toEqual([
      'stack A10 tiling:a:0,0,0 spent 0 speed 4',
      'stack B9 tiling:a:0,0,1 spent 0 speed 4',
    ]);
  });

  it('A stack line carries spent and a speed override', () => {
    const board = smallBoard({
      groups: [{ arrow: 'tiling:a:0,0,0', owner: 'A', heads: 5, spent: 2, speed: 3, speedOverride: 1 }],
    });

    expect(readMap(boardMap(board)).stackLines).toEqual(['stack A5 tiling:a:0,0,0 spent 2 speed 3 override 1']);
  });

  it('A spawner whose thirds are split between seats names each holder', () => {
    const vertex = 'tiling:v:1,1,up';
    const board = smallBoard({
      territory: { A: ['tiling:a:0,0,0'], B: [] },
      spawners: [{ vertex, force: '1/4', held: { C: 1, A: 2 }, unclaimed: 0 }],
    });

    const map = readMap(boardMap(board));

    expect(map.label(vertexSpot(vertex))).toBe('aac4');
    expect(map.stackLines).toEqual(['stacks: none']);
  });

  it('A part-held spawner shows its open thirds as "o"', () => {
    const vertex = 'tiling:v:1,1,down';
    const board = smallBoard({
      territory: { A: ['tiling:a:0,0,0'], B: [] },
      spawners: [{ vertex, force: '1/6', held: { B: 1 }, unclaimed: 2 }],
    });

    expect(readMap(boardMap(board)).label(vertexSpot(vertex))).toBe('boo6');
  });

  it.each([
    { forces: [] as string[], width: 5 },
    { forces: ['1/5'], width: 9 },
    { forces: ['1/5', '1/16'], width: 11 },
    { forces: ['2/7'], width: 13 },
    { forces: ['1/5', '2/7', '1/16'], width: 13 },
    { forces: ['11/100'], width: 19 },
  ])('Any force draws from its fraction, and cells widen to the longest label ($forces)', ({ forces, width }) => {
    const vertices = ['tiling:v:0,0,up', 'tiling:v:1,0,down', 'tiling:v:-1,1,up'];
    const board = smallBoard({
      territory: { A: ['tiling:a:0,0,0', 'tiling:a:0,1,0'], B: [] },
      spawners: forces.map((force, i) => ({ vertex: vertices[i] ?? '', force, held: {}, unclaimed: 3 })),
    });

    const text = boardMap(board);
    const map = readMap(text);

    expect(map.width).toBe(width);
    expect(text).toContain(`${String(width)} characters per column`);
    expect(map.slot(arrowSpot('tiling:a:0,0,0'))).toBe('a');
    forces.forEach((force, i) => {
      const label = `ooo${force.startsWith('1/') ? force.slice(2) : force}`;
      expect(map.label(vertexSpot(vertices[i] ?? ''))).toBe(label);
    });
    const labelsLine = map.lines.find((line) => /^\s*-?\d+(\s+-?\d+)*$/.test(line)) ?? '';
    const cols = labelsLine.trim().split(/\s+/).map(Number);
    expect(cols[1]).toBe((cols[0] ?? 0) + 1);
    const firstAt = labelsLine.indexOf(String(cols[0]));
    const secondAt = labelsLine.indexOf(` ${String(cols[1])}`, firstAt + 1) + 1;
    expect(secondAt - firstAt).toBe(width);
  });
});

describe('What the map refuses', () => {
  it('An arrow id from a fixture board is refused', () => {
    const foreign = 'fixtures:minimal:a:p0-p1';
    const board = smallBoard({ territory: { A: [foreign], B: [] } });

    expect(() => boardMap(board)).toThrow(ContractViolation);
    expect(() => boardMap(board)).toThrow(foreign);
  });

  it.each([
    { problem: 'a non-canonical arrow id', board: smallBoard({ territory: { A: ['tiling:a:01,0,0'], B: [] } }), names: 'tiling:a:01,0,0' },
    { problem: 'a non-canonical vertex id', board: smallBoard({ spawners: [{ vertex: 'tiling:v:0,-0,up', force: '1/5', held: {}, unclaimed: 3 }] }), names: 'tiling:v:0,-0,up' },
    { problem: 'a territory owner "Z"', board: smallBoard({ territory: { A: [], B: [], Z: ['tiling:a:0,0,0'] } }), names: 'Z' },
    { problem: 'a seat "AB" in players', board: smallBoard({ players: ['A', 'AB'] }), names: 'AB' },
    { problem: 'a me that is not a seat letter', board: smallBoard({ me: 'b' }), names: 'b' },
    { problem: 'a stack owner "I"', board: smallBoard({ groups: [group('tiling:a:0,0,0', 'I', 1)] }), names: 'I' },
    { problem: 'a spawner holder "O"', board: smallBoard({ spawners: [{ vertex: 'tiling:v:0,0,up', force: '1/5', held: { O: 1 }, unclaimed: 2 }] }), names: 'O' },
    { problem: "an arrow in A's and B's territory", board: smallBoard({ territory: { A: ['tiling:a:0,0,0'], B: ['tiling:a:0,0,0'] } }), names: 'tiling:a:0,0,0' },
    { problem: "an arrow twice in A's trail", board: smallBoard({ trails: { A: ['tiling:a:0,0,0', 'tiling:a:0,0,0'], B: [] } }), names: 'tiling:a:0,0,0' },
    { problem: 'two stacks on one arrow', board: smallBoard({ groups: [group('tiling:a:0,0,0', 'A', 1), group('tiling:a:0,0,0', 'B', 2)] }), names: 'tiling:a:0,0,0' },
    { problem: 'one vertex twice in spawners', board: smallBoard({ spawners: [
      { vertex: 'tiling:v:0,0,up', force: '1/5', held: {}, unclaimed: 3 },
      { vertex: 'tiling:v:0,0,up', force: '1/6', held: {}, unclaimed: 3 },
    ] }), names: 'tiling:v:0,0,up' },
    { problem: 'a spawner whose held plus unclaimed is 2', board: smallBoard({ spawners: [{ vertex: 'tiling:v:0,0,up', force: '1/5', held: { A: 1 }, unclaimed: 1 }] }), names: 'tiling:v:0,0,up' },
    { problem: 'a spawner whose held plus unclaimed is 4', board: smallBoard({ spawners: [{ vertex: 'tiling:v:0,0,up', force: '1/5', held: { A: 2 }, unclaimed: 2 }] }), names: 'tiling:v:0,0,up' },
    { problem: 'a spawner holding 0 for a seat', board: smallBoard({ spawners: [{ vertex: 'tiling:v:0,0,up', force: '1/5', held: { A: 0 }, unclaimed: 3 }] }), names: 'tiling:v:0,0,up' },
    { problem: 'a spawner with negative unclaimed', board: smallBoard({ spawners: [{ vertex: 'tiling:v:0,0,up', force: '1/5', held: { A: 4 }, unclaimed: -1 }] }), names: 'tiling:v:0,0,up' },
    { problem: 'a spawner force "1/x"', board: smallBoard({ spawners: [{ vertex: 'tiling:v:0,0,up', force: '1/x', held: {}, unclaimed: 3 }] }), names: '1/x' },
    { problem: 'a spawner force "5"', board: smallBoard({ spawners: [{ vertex: 'tiling:v:0,0,up', force: '5', held: {}, unclaimed: 3 }] }), names: '5' },
  ])('A board the map cannot draw exactly is refused: $problem', ({ board, names }) => {
    expect(() => boardMap(board)).toThrow(ContractViolation);
    expect(() => boardMap(board)).toThrow(names);
  });

  it.each([
    { name: 'plain text', text: 'hello' },
    { name: 'an empty string', text: '' },
    { name: 'a header with no widths', text: 'map me=B active=B players=A,B; 5 characters per column.\n' },
    { name: 'a slot glyph that is not a glyph', text: 'map me=B active=B players=A,B; 5 characters per column, 1 per arrow.\n       0\n  0 ? . .\n' },
  ])('parseBoardMap refuses text that is not a map: $name', ({ text }) => {
    expect(() => parseBoardMap(text)).toThrow(ContractViolation);
  });

  it('parseBoardView keeps a valid board, speedOverride included', () => {
    const board = smallBoard({
      territory: { A: ['tiling:a:0,0,0'], B: [] },
      groups: [{ ...group('tiling:a:0,0,0', 'A', 3), speedOverride: 1 }],
      spawners: [{ vertex: 'tiling:v:0,0,up', force: '1/9', held: { A: 1 }, unclaimed: 2 }],
    });

    expect(parseBoardView(board)).toEqual(board);
    expect(parseBoardView({ stop: false, offer: 'x', board })).toEqual(board);
  });

  it.each([
    { name: 'a stop result with no board', input: { stop: true, reason: 'not-your-turn' } },
    { name: 'a board with territory as a number', input: { ...smallBoard(), territory: 3 } },
    {
      name: 'a board missing spawners',
      input: Object.fromEntries(Object.entries(smallBoard()).filter(([key]) => key !== 'spawners')),
    },
    { name: 'null', input: null },
    { name: 'a board with no me', input: { ...smallBoard(), me: 2 } },
    { name: 'players holding a number', input: { ...smallBoard(), players: ['A', 2] } },
    { name: 'a trail list holding a number', input: { ...smallBoard(), trails: { A: [1], B: [] } } },
    { name: 'a territory list that is not a list', input: { ...smallBoard(), territory: { A: 'x', B: [] } } },
    { name: 'a group with a fractional head count', input: { ...smallBoard(), groups: [{ ...group('tiling:a:0,0,0', 'B', 2), heads: 1.5 }] } },
    { name: 'a group with no owner', input: { ...smallBoard(), groups: [{ arrow: 'tiling:a:0,0,0', heads: 1, spent: 0, speed: 1 }] } },
    { name: 'a group with no arrow', input: { ...smallBoard(), groups: [{ owner: 'B', heads: 1, spent: 0, speed: 1 }] } },
    { name: 'a group with spent as text', input: { ...smallBoard(), groups: [{ ...group('tiling:a:0,0,0', 'B', 1), spent: '0' }] } },
    { name: 'a group with no speed', input: { ...smallBoard(), groups: [{ arrow: 'tiling:a:0,0,0', owner: 'B', heads: 1, spent: 0 }] } },
    { name: 'a spawner with no held', input: { ...smallBoard(), spawners: [{ vertex: 'tiling:v:0,0,up', force: '1/9', unclaimed: 3 }] } },
    { name: 'a spawner whose held count is text', input: { ...smallBoard(), spawners: [{ vertex: 'tiling:v:0,0,up', force: '1/9', held: { A: '1' }, unclaimed: 2 }] } },
    { name: 'a spawner with no vertex', input: { ...smallBoard(), spawners: [{ force: '1/9', held: {}, unclaimed: 3 }] } },
    { name: 'a spawner with no force', input: { ...smallBoard(), spawners: [{ vertex: 'tiling:v:0,0,up', held: {}, unclaimed: 3 }] } },
    { name: 'a spawner with no unclaimed', input: { ...smallBoard(), spawners: [{ vertex: 'tiling:v:0,0,up', force: '1/9', held: {} }] } },
    { name: 'a spawner row that is a number', input: { ...smallBoard(), spawners: [3] } },
  ])('parseBoardView refuses $name', ({ input }) => {
    expect(parseBoardView(input)).toBeUndefined();
  });

  it('pnpm board-map on input that is not a board exits 1', () => {
    const result = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'board-map.mjs')], {
      cwd: repoRoot,
      input: '{}',
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/board/i);
    expect(result.stdout).toBe('');
  });
});
