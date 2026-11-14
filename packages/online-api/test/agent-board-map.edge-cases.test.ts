/**
 * docs/spec/agent-board-map/agent-board-map.edge-cases.feature — the observe
 * boundaries (SCENARIOS.md flow 1, every alt). Map boundaries live in
 * packages/byok-offer/test.
 *
 * @see docs/spec/agent-board-map/agent-board-map.md
 * @see docs/spec/agent-board-map/SCENARIOS.md
 */

import { describe, expect, it } from 'vitest';
import type { ArrowId, GameState, PlayerId } from '@conquarrow/contracts';
import { offerText } from '@conquarrow/byok-offer';
import { aliceHash, carolHash, groupHashOfUserHashes } from './support';
import {
  CAROL,
  TOKEN,
  accessToken,
  agent,
  atSeat,
  geometry,
  heuristicSeat,
  human,
  inviteHandle,
  keysOf,
  openInvite,
  opening,
  postDoor,
  seedInvite,
  seedStarted,
  toolJson,
  toolsCall,
  withRig,
  type RemoteRig,
} from './remote-agent-mcp.support';

const A = () => aliceHash();
const C = () => carolHash();
const SEATS = () => [human(A()), agent(C()), heuristicSeat()];

const seed = (rig: RemoteRig, state: GameState): void => {
  seedStarted(rig, {
    token: TOKEN,
    groupHash: groupHashOfUserHashes([A()]),
    gameNumber: '000001',
    seats: SEATS(),
    state,
    version: 1,
    members: [A(), C()],
  });
};

const observe = (rig: RemoteRig, full: unknown) =>
  postDoor(rig, toolsCall('observe', { handle: inviteHandle(), full }), accessToken(rig, CAROL.sub));

/** A long trail for seat A on arrows no one holds: more than the 24-arrow sample. */
const withLongTrail = (state: GameState, length: number): GameState => {
  const a = state.players[0] as PlayerId;
  const window = geometry.window(geometry.seedPoint(), 9);
  const free: ArrowId[] = [];
  for (const arrow of [...window.arrows].sort()) {
    if (free.length >= length) break;
    if (state.territory.has(arrow) || state.groups.has(arrow)) continue;
    free.push(arrow);
  }
  if (free.length < length) throw new Error('setup: not enough free arrows');
  return { ...state, trails: new Map([...state.trails, [a, new Set(free)]]) };
};

describe('Only a stop-free observe with full true carries a board', () => {
  it('full true on a stop result carries no board: an invite C has joined that is not started', async () => {
    await withRig(async (rig) => {
      seedInvite(rig, TOKEN, openInvite(SEATS(), A()));
      const before = keysOf(rig);

      const text = toolJson(await observe(rig, true));

      expect(text?.['stop']).toBe(true);
      expect(text?.['reason']).toBe('not-started');
      expect(text).not.toHaveProperty('board');
      expect(text).not.toHaveProperty('offer');
      expect(keysOf(rig)).toEqual(before);
    });
  });

  it('full true on a stop result carries no board: a started game whose active seat is A\'s human seat', async () => {
    await withRig(async (rig) => {
      seed(rig, atSeat(opening(3), 0));

      const text = toolJson(await observe(rig, true));

      expect(text?.['stop']).toBe(true);
      expect(text?.['reason']).toBe('not-your-turn');
      expect(text).not.toHaveProperty('board');
      expect(text).not.toHaveProperty('offer');
    });
  });

  it.each([{ value: false }, { value: 'true' }, { value: 1 }])(
    'full that is not the boolean true is the compact result ($value)',
    async ({ value }) => {
      await withRig(async (rig) => {
        const state = atSeat(opening(3), 1);
        seed(rig, state);
        const seat = state.players[1];
        if (seat === undefined) throw new Error('setup: missing agent player');

        const text = toolJson(await observe(rig, value));

        expect(text).toEqual({ stop: false, offer: offerText(state, seat) });
      });
    },
  );
});

describe('The board is whole where the offer is capped', () => {
  it('A trail longer than the sample is listed whole', async () => {
    await withRig(async (rig) => {
      const state = withLongTrail(atSeat(opening(3), 1), 30);
      seed(rig, state);
      const a = String(state.players[0]);

      const text = toolJson(await observe(rig, true));
      const board = text?.['board'] as { trails: Record<string, string[]> } | undefined;

      expect(board?.trails[a]?.length).toBe(30);
      expect([...(board?.trails[a] ?? [])].sort()).toEqual(
        [...(state.trails.get(state.players[0] as PlayerId) ?? [])].map(String).sort(),
      );
      const offer = String(text?.['offer']);
      const lines = offer.split('\n');
      const stateJson = JSON.parse(lines[lines.indexOf('STATE_JSON:') + 1] ?? 'null') as {
        trails: Record<string, { count: number; sample: string[]; truncated: boolean }>;
      };
      expect(stateJson.trails[a]?.truncated).toBe(true);
      expect(stateJson.trails[a]?.sample.length).toBe(24);
    });
  });
});
