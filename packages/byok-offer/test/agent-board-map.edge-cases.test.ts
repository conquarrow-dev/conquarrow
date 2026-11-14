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
import { boardMap, boardView, parseBoardView } from '../src/board';
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
  it('A stack on a trail arrow shows the head count, a trail on territory shows the trail', () => {
    const board = smallBoard({
      territory: { A: ['tiling:a:0,0,0', 'tiling:a:0,0,1'], B: [] },
      trails: { A: [], B: ['tiling:a:0,0,0', 'tiling:a:0,0,1'] },
      groups: [group('tiling:a:0,0,0', 'B', 3)],
    });

    const map = readMap(boardMap(board));

    expect(map.char(arrowSpot('tiling:a:0,0,0'))).toBe('3');
    expect(map.char(arrowSpot('tiling:a:0,0,1'))).toBe('B');
  });

  it('A stack of 10 or more heads shows "+"', () => {
    const board = smallBoard({
      territory: { A: [], B: ['tiling:a:0,0,0', 'tiling:a:0,0,1'] },
      groups: [group('tiling:a:0,0,0', 'B', 10), group('tiling:a:0,0,1', 'B', 9)],
    });

    const map = readMap(boardMap(board));

    expect(map.char(arrowSpot('tiling:a:0,0,0'))).toBe('+');
    expect(map.char(arrowSpot('tiling:a:0,0,1'))).toBe('9');
    expect(map.stacksLine).toBe('stacks: B10 tiling:a:0,0,0; B9 tiling:a:0,0,1');
  });

  it('A spawner whose shares are split between seats is all held', () => {
    const vertex = 'tiling:v:1,1,up';
    const board = smallBoard({
      territory: { A: ['tiling:a:0,0,0'], B: [] },
      spawners: [{ vertex, force: '1/9', held: { A: 2, C: 1 }, unclaimed: 0 }],
    });

    const map = readMap(boardMap(board));

    expect(map.char(vertexSpot(vertex))).toBe('#');
    expect(map.stacksLine).toBe('stacks: none');
  });

  it('A part-held spawner is "*"', () => {
    const vertex = 'tiling:v:1,1,down';
    const board = smallBoard({
      territory: { A: ['tiling:a:0,0,0'], B: [] },
      spawners: [{ vertex, force: '1/9', held: { B: 1 }, unclaimed: 2 }],
    });

    expect(readMap(boardMap(board)).char(vertexSpot(vertex))).toBe('*');
  });
});

describe('What the map refuses', () => {
  it('An arrow id from a fixture board is refused', () => {
    const foreign = 'fixtures:minimal:a:p0-p1';
    const board = smallBoard({ territory: { A: [foreign], B: [] } });

    expect(() => boardMap(board)).toThrow(ContractViolation);
    expect(() => boardMap(board)).toThrow(foreign);
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
