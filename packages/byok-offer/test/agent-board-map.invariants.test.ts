/**
 * docs/spec/agent-board-map/agent-board-map.md#invariants — properties over
 * openings and the rebuilt smoke-test game. Invariant 4 (compact observe) is
 * a door property and lives in packages/online-api/test.
 *
 * @see docs/spec/agent-board-map/agent-board-map.md
 */

import { describe, expect, it } from 'vitest';
import type { GameState } from '@conquarrow/contracts';
import { boardMap, boardView, parseBoardView, type BoardView } from '../src/board';
import {
  arrowSpot,
  expectedGlyph,
  fixtureState,
  geometry,
  opening,
  readMap,
  spawnerGlyph,
  vertexSpot,
} from './agent-board-map.support';

const positions = (): readonly { name: string; state: GameState }[] => [
  { name: '3-seat opening', state: opening(3) },
  { name: '6-seat opening', state: opening(6) },
  { name: 'smoke-test game', state: fixtureState() },
];

const everySeat = (state: GameState) => state.players;

describe('agent-board-map invariants', () => {
  it.each(positions())('1. every territory arrow is listed once, under its owner ($name)', ({ state }) => {
    for (const me of everySeat(state)) {
      const board = boardView(geometry, state, me);
      const listed = Object.entries(board.territory).flatMap(([owner, arrows]) =>
        arrows.map((arrow) => [arrow, owner] as const),
      );
      expect(listed.length).toBe(state.territory.size);
      expect(new Map(listed)).toEqual(
        new Map([...state.territory].map(([arrow, owner]) => [String(arrow), String(owner)])),
      );
    }
  });

  it.each(positions())('2. every trail arrow of every seat is listed ($name)', ({ state }) => {
    const me = state.players[0];
    if (me === undefined) throw new Error('setup: no seat');
    const board = boardView(geometry, state, me);
    for (const player of state.players) {
      const want = [...(state.trails.get(player) ?? [])].map(String).sort();
      expect([...(board.trails[String(player)] ?? [])].sort()).toEqual(want);
    }
  });

  it.each(positions())('3. every spawner is listed, held plus unclaimed is 3 ($name)', ({ state }) => {
    const me = state.players[0];
    if (me === undefined) throw new Error('setup: no seat');
    const board = boardView(geometry, state, me);
    expect(board.spawners.map((row) => row.vertex).sort()).toEqual(
      [...state.spawners.keys()].map(String).sort(),
    );
    for (const row of board.spawners) {
      const held = Object.values(row.held).reduce((sum, n) => sum + n, 0);
      expect(held + row.unclaimed).toBe(3);
      const vertex = [...state.spawners.keys()].find((v) => String(v) === row.vertex);
      if (vertex === undefined) throw new Error('unreachable: listed above');
      const owners: Record<string, number> = {};
      for (const arrow of geometry.borderArrows(vertex)) {
        const owner = state.territory.get(arrow);
        if (owner !== undefined) owners[String(owner)] = (owners[String(owner)] ?? 0) + 1;
      }
      expect(row.held).toEqual(owners);
    }
  });

  it('5. the same board in any list order renders the same map', () => {
    const state = fixtureState();
    const me = state.players[1];
    if (me === undefined) throw new Error('setup: no seat B');
    const board = boardView(geometry, state, me);
    const reversed: BoardView = {
      ...board,
      territory: Object.fromEntries(
        Object.entries(board.territory).reverse().map(([k, v]) => [k, [...v].reverse()]),
      ),
      trails: Object.fromEntries(
        Object.entries(board.trails).reverse().map(([k, v]) => [k, [...v].reverse()]),
      ),
      groups: [...board.groups].reverse(),
      spawners: [...board.spawners].reverse(),
    };
    expect(boardMap(reversed)).toBe(boardMap(board));
    const roundTrip = parseBoardView(JSON.parse(JSON.stringify({ board })) as unknown);
    expect(roundTrip).toBeDefined();
    if (roundTrip !== undefined) expect(boardMap(roundTrip)).toBe(boardMap(board));
  });

  it.each(positions())('6. every listed arrow is drawn at its slot with its glyph ($name)', ({ state }) => {
    const me = state.players[0];
    if (me === undefined) throw new Error('setup: no seat');
    const board = boardView(geometry, state, me);
    const map = readMap(boardMap(board));
    const arrows = new Set<string>([
      ...Object.values(board.territory).flat(),
      ...Object.values(board.trails).flat(),
      ...board.groups.map((row) => row.arrow),
    ]);
    expect(arrows.size).toBeGreaterThan(0);
    for (const arrow of arrows) {
      expect(map.char(arrowSpot(arrow)), arrow).toBe(expectedGlyph(board, arrow));
    }
  });

  it.each(positions())('7. every spawner is drawn once as o, * or # ($name)', ({ state }) => {
    const me = state.players[0];
    if (me === undefined) throw new Error('setup: no seat');
    const board = boardView(geometry, state, me);
    const map = readMap(boardMap(board));
    for (const row of board.spawners) {
      expect(map.char(vertexSpot(row.vertex)), row.vertex).toBe(spawnerGlyph(row));
    }
    let drawn = 0;
    for (const body of map.rows.values()) drawn += (body.match(/[o*#]/g) ?? []).length;
    expect(drawn).toBe(board.spawners.length);
  });
});
