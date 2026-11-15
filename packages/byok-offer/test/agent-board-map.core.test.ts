/**
 * docs/spec/agent-board-map/agent-board-map.core.feature — the map and the CLI.
 * The observe scenarios live in packages/online-api/test (the door is the component).
 *
 * @see docs/spec/agent-board-map/agent-board-map.md
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { boardMap, boardView } from '../src/board';
import {
  FIXTURE_BOARD,
  FIXTURE_MAP,
  fixtureState,
  geometry,
  group,
  readMap,
  repoRoot,
  smallBoard,
} from './agent-board-map.support';

const runCli = (input: string): { stdout: string; stderr: string; status: number | null } => {
  const result = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'board-map.mjs')], {
    cwd: repoRoot,
    input,
    encoding: 'utf8',
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
};

const seatB = () => {
  const state = fixtureState();
  const b = state.players[1];
  if (b === undefined) throw new Error('setup: fixture has no seat B');
  return { state, b };
};

describe('boardMap draws the board as text', () => {
  it('The map draws territory, trails, stacks and spawners on the tiling\'s layout', () => {
    const board = smallBoard({
      territory: { A: ['tiling:a:0,0,0'], B: [] },
      trails: { A: [], B: ['tiling:a:0,0,1'] },
      groups: [group('tiling:a:0,0,2', 'B', 2)],
      spawners: [
        { vertex: 'tiling:v:0,0,up', force: '1/5', held: {}, unclaimed: 3 },
        { vertex: 'tiling:v:0,-1,down', force: '1/7', held: { A: 3 }, unclaimed: 0 },
      ],
    });

    const map = readMap(boardMap(board));

    expect(map.width).toBe(5);
    expect(map.cell(0, 0)).toBe(' 2aB ');
    expect(map.cell(1, 0)).toBe('#7 o5');
    expect(map.lines[0]).toContain('me=B');
    expect(map.lines[0]).toContain('active=B');
    expect(map.lines.slice(1, 5).join('\n')).toMatch(/territory/);
    expect(map.lines.slice(1, 5).join('\n')).toMatch(/trail/);
    expect(map.lines.slice(1, 5).join('\n')).toMatch(/spawner/);
    const legend = map.lines.slice(1, 5).join('\n');
    expect(legend).toMatch(/force/);
    expect(legend).toMatch(/1\/d/);
    expect(legend).toMatch(/n\/d/);
    for (const fixed of ['1/3', '1/9', '1/12', '12 = ']) expect(legend).not.toContain(fixed);
    expect(map.lines[5]).toMatch(/^\s+-?\d/);
    expect(map.stacksLine).toBe('stacks: B2 tiling:a:0,0,2');
  });

  it('pnpm board-map prints the map of a saved observe result', () => {
    const { state, b } = seatB();
    const board = boardView(geometry, state, b);
    const saved = JSON.stringify({ stop: false, offer: 'offer text', board });

    const result = runCli(saved);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(boardMap(board));
  });
});

describe('The smoke-test game renders the golden map', () => {
  it('The rebuilt smoke-test game replays and draws the golden map', () => {
    const { state, b } = seatB();

    expect(String(state.activePlayer)).toBe('B');
    expect(existsSync(FIXTURE_MAP), `golden map missing: ${FIXTURE_MAP}`).toBe(true);
    expect(boardMap(boardView(geometry, state, b))).toBe(readFileSync(FIXTURE_MAP, 'utf8'));
    expect(existsSync(FIXTURE_BOARD), `golden board missing: ${FIXTURE_BOARD}`).toBe(true);
    expect(boardView(geometry, state, b)).toEqual(JSON.parse(readFileSync(FIXTURE_BOARD, 'utf8')));
  });
});
