/**
 * docs/spec/agent-board-map/agent-board-map.md#invariants 14-15 — the map is
 * honest. Property tests (fast-check) over random representable boards on
 * the generated tiling: parseBoardMap(boardMap(b)) is b normalized; the map
 * ignores list order; distinct arrows and vertices get distinct places, the
 * places the spec states.
 *
 * @see docs/spec/agent-board-map/agent-board-map.md#reading-a-map-back
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { arrowMapSpot, boardMap, parseBoardMap, vertexMapSpot } from '../src/board';
import { arrowIdArb, boardArb, normalized, shuffledArb, vertexIdArb } from './agent-board-map.arbitraries';
import { arrowSpot, vertexSpot } from './agent-board-map.support';

/** Runs per property. Each run draws and parses a board of up to 40 arrows and 12 spawners. */
export const RUNS = 300;

const spotKey = (spot: { row: number; col: number; slot: number }): string =>
  `${String(spot.row)},${String(spot.col)},${String(spot.slot)}`;

describe('agent-board-map honest-map invariants', () => {
  it('14. parseBoardMap(boardMap(board)) equals the board normalized, for any representable board', () => {
    fc.assert(
      fc.property(boardArb, (board) => {
        expect(parseBoardMap(boardMap(board))).toEqual(normalized(board));
      }),
      { numRuns: RUNS },
    );
  });

  it('7. the map is the same text for the board with its lists in any order', () => {
    fc.assert(
      fc.property(
        boardArb.chain((board) => fc.tuple(fc.constant(board), shuffledArb(board))),
        ([board, shuffled]) => {
          expect(boardMap(shuffled)).toBe(boardMap(board));
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('15. distinct arrows get distinct (row, column, slot) places, the ones the spec states', () => {
    fc.assert(
      fc.property(fc.uniqueArray(arrowIdArb, { minLength: 2, maxLength: 60 }), (arrows) => {
        const spots = arrows.map(arrowMapSpot);
        expect(new Set(spots.map(spotKey)).size).toBe(arrows.length);
        arrows.forEach((arrow, i) => {
          expect(spots[i], arrow).toEqual(arrowSpot(arrow));
        });
      }),
      { numRuns: RUNS },
    );
  });

  it('15. distinct vertices get distinct (row, column, side) places, the ones the spec states, never a point cell', () => {
    fc.assert(
      fc.property(fc.uniqueArray(vertexIdArb, { minLength: 2, maxLength: 60 }), (vertices) => {
        const spots = vertices.map(vertexMapSpot);
        expect(new Set(spots.map(spotKey)).size).toBe(vertices.length);
        vertices.forEach((vertex, i) => {
          expect(spots[i], vertex).toEqual(vertexSpot(vertex));
          expect(Math.abs((spots[i]?.row ?? 0) - (spots[i]?.col ?? 0)) % 2, vertex).toBe(1);
        });
      }),
      { numRuns: RUNS },
    );
  });
});
