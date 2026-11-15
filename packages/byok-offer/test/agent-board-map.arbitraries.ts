/**
 * fast-check arbitraries for docs/spec/agent-board-map invariants 14-16:
 * representable boards on the generated tiling, and the spec's normal form.
 *
 * A board here is built per arrow from its layers (territory owner, trail
 * owners, stack), so stacks sit on trails and territory, trails share
 * arrows, and owners outside `players` occur. Lists come out in generation
 * order, not sorted, and seats with nothing are left out: `normalized` is
 * what the spec says `parseBoardMap` returns.
 *
 * @see docs/spec/agent-board-map/agent-board-map.md#reading-a-map-back
 */

import fc from 'fast-check';
import type { BoardView } from '../src/board';

export const SEATS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

const coord = fc.integer({ min: -12, max: 12 });

export const arrowIdArb = fc
  .tuple(coord, coord, fc.constantFrom(0, 1, 2))
  .map(([i, j, d]) => `tiling:a:${String(i)},${String(j)},${String(d)}`);

export const vertexIdArb = fc
  .tuple(coord, coord, fc.constantFrom('up', 'down'))
  .map(([i, j, parity]) => `tiling:v:${String(i)},${String(j)},${parity}`);

/** Any n/d: forces are a balance setting, so no value is special. */
export const forceArb = fc
  .tuple(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 300 }))
  .map(([n, d]) => `${String(n)}/${String(d)}`);

/** Heads biased to cross 9: 1-9 often, 10-99 often enough. */
const headsArb = fc.oneof(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 10, max: 99 }));

interface Layers {
  readonly land: string | undefined;
  readonly trails: readonly string[];
  readonly stack: Omit<BoardView['groups'][number], 'arrow'> | undefined;
}

const layersArb = (owner: fc.Arbitrary<string>): fc.Arbitrary<Layers> =>
  fc.record({
    land: fc.option(owner, { nil: undefined }),
    trails: fc.uniqueArray(owner, { maxLength: 2 }),
    stack: fc.option(
      fc.record(
        {
          owner,
          heads: headsArb,
          spent: fc.integer({ min: 0, max: 9 }),
          speed: fc.integer({ min: 1, max: 7 }),
          speedOverride: fc.integer({ min: 0, max: 7 }),
        },
        { requiredKeys: ['owner', 'heads', 'spent', 'speed'] },
      ),
      { nil: undefined },
    ),
  });

/** Three thirds, each a holder or unclaimed: any split. */
const sharesArb = (owner: fc.Arbitrary<string>) =>
  fc.array(fc.option(owner, { nil: undefined }), { minLength: 3, maxLength: 3 }).map((thirds) => {
    const held: Record<string, number> = {};
    for (const third of thirds) if (third !== undefined) held[third] = (held[third] ?? 0) + 1;
    return { held, unclaimed: thirds.filter((third) => third === undefined).length };
  });

const push = (lists: Record<string, string[]>, owner: string, arrow: string): void => {
  (lists[owner] ??= []).push(arrow);
};

/** A representable board: 2-4 seats, any layers on up to 40 arrows, up to 12 spawners. */
export const boardArb: fc.Arbitrary<BoardView> = fc
  .shuffledSubarray([...SEATS], { minLength: 2, maxLength: 4 })
  .chain((players) => {
    const owner = fc.oneof(
      { arbitrary: fc.constantFrom(...players), weight: 4 },
      { arbitrary: fc.constantFrom(...SEATS), weight: 1 },
    );
    return fc.record({
      players: fc.constant(players),
      me: fc.constantFrom(...players),
      activePlayer: fc.constantFrom(...players),
      arrows: fc.uniqueArray(fc.tuple(arrowIdArb, layersArb(owner)), {
        selector: ([arrow]) => arrow,
        maxLength: 40,
      }),
      spawners: fc.uniqueArray(fc.tuple(vertexIdArb, forceArb, sharesArb(owner)), {
        selector: ([vertex]) => vertex,
        maxLength: 12,
      }),
    });
  })
  .map(({ players, me, activePlayer, arrows, spawners }) => {
    const territory: Record<string, string[]> = {};
    const trails: Record<string, string[]> = {};
    const groups: BoardView['groups'][number][] = [];
    for (const [arrow, layers] of arrows) {
      if (layers.land !== undefined) push(territory, layers.land, arrow);
      for (const seat of layers.trails) push(trails, seat, arrow);
      if (layers.stack !== undefined) groups.push({ arrow, ...layers.stack });
    }
    return {
      me,
      players,
      activePlayer,
      territory,
      trails,
      groups,
      spawners: spawners.map(([vertex, force, shares]) => ({ vertex, force, ...shares })),
    };
  });

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const normalLists = (players: readonly string[], lists: BoardView['territory']): Record<string, string[]> => {
  const others = Object.keys(lists)
    .filter((owner) => !players.includes(owner) && (lists[owner]?.length ?? 0) > 0)
    .sort(byText);
  const out: Record<string, string[]> = {};
  for (const owner of [...players, ...others]) out[owner] = [...(lists[owner] ?? [])].sort(byText);
  return out;
};

/** The spec's normal form: what parseBoardMap returns for a board's map. */
export const normalized = (board: BoardView): BoardView => ({
  me: board.me,
  players: [...board.players],
  activePlayer: board.activePlayer,
  territory: normalLists(board.players, board.territory),
  trails: normalLists(board.players, board.trails),
  groups: [...board.groups].sort((a, b) => byText(a.arrow, b.arrow)),
  spawners: [...board.spawners].sort((a, b) => byText(a.vertex, b.vertex)),
});

/** The same board with every list, and the key order, shuffled. */
export const shuffledArb = (board: BoardView): fc.Arbitrary<BoardView> => {
  const shuffledLists = (lists: BoardView['territory']) =>
    fc
      .tuple(
        fc.shuffledSubarray(Object.keys(lists), { minLength: Object.keys(lists).length }),
        ...Object.keys(lists).map((key) =>
          fc.shuffledSubarray([...(lists[key] ?? [])], { minLength: lists[key]?.length ?? 0 }),
        ),
      )
      .map(([keys, ...values]) => {
        const byKey = new Map(Object.keys(lists).map((key, i) => [key, values[i] ?? []]));
        return Object.fromEntries(keys.map((key) => [key, byKey.get(key) ?? []]));
      });
  return fc.record({
    territory: shuffledLists(board.territory),
    trails: shuffledLists(board.trails),
    groups: fc.shuffledSubarray([...board.groups], { minLength: board.groups.length }),
    spawners: fc.shuffledSubarray([...board.spawners], { minLength: board.spawners.length }),
  }).map((lists) => ({ ...board, ...lists }));
};
