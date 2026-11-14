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
import { ContractViolation, type GameState } from '@conquarrow/contracts';
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
      territory: { A: [], B: ['tiling:a:0,0,0'] },
      groups: [group('tiling:a:0,0,0', 'B', 12)],
    });

    const map = readMap(boardMap(board));

    expect(map.char(arrowSpot('tiling:a:0,0,0'))).toBe('+');
    expect(map.stacksLine).toBe('stacks: B12 tiling:a:0,0,0');
  });

  it('A spawner whose shares are split between seats is all held', () => {
    const vertex = 'tiling:v:1,1,up';
    const board = smallBoard({
      territory: { A: ['tiling:a:0,0,0'], B: [] },
      spawners: [{ vertex, force: '1/9', held: { A: 2, C: 1 }, unclaimed: 0 }],
    });

    expect(readMap(boardMap(board)).char(vertexSpot(vertex))).toBe('#');
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

  it.each([
    { name: 'a stop result with no board', input: { stop: true, reason: 'not-your-turn' } },
    { name: 'a board with territory as a number', input: { ...smallBoard(), territory: 3 } },
    {
      name: 'a board missing spawners',
      input: Object.fromEntries(Object.entries(smallBoard()).filter(([key]) => key !== 'spawners')),
    },
    { name: 'null', input: null },
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
