/**
 * docs/spec/agent-board-map/agent-board-map.core.feature — the observe scenarios.
 * The door is the component; S3 is the fake store (SCENARIOS.md flow 1).
 *
 * @see docs/spec/agent-board-map/agent-board-map.md
 * @see docs/spec/agent-board-map/SCENARIOS.md
 */

import { describe, expect, it } from 'vitest';
import { offerText } from '@conquarrow/byok-offer';
import { aliceHash, carolHash, groupHashOfUserHashes } from './support';
import {
  CAROL,
  TOKEN,
  accessToken,
  agent,
  atSeat,
  heuristicSeat,
  human,
  inviteHandle,
  jsonOf,
  opening,
  postDoor,
  seedStarted,
  toolJson,
  toolsCall,
  withRig,
  type RemoteRig,
} from './remote-agent-mcp.support';

const A = () => aliceHash();
const C = () => carolHash();

const seedAgentTurn = (rig: RemoteRig) => {
  const state = atSeat(opening(3), 1);
  seedStarted(rig, {
    token: TOKEN,
    groupHash: groupHashOfUserHashes([A()]),
    gameNumber: '000001',
    seats: [human(A()), agent(C()), heuristicSeat()],
    state,
    version: 1,
    members: [A(), C()],
  });
  const seat = state.players[1];
  if (seat === undefined) throw new Error('setup: missing agent player');
  return { state, seat };
};

const stateJsonOf = (offer: string): Record<string, unknown> => {
  const lines = offer.split('\n');
  const at = lines.indexOf('STATE_JSON:');
  return JSON.parse(lines[at + 1] ?? 'null') as Record<string, unknown>;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

describe('observe with full true adds the board and keeps the offer', () => {
  it('full observe on the agent\'s turn returns the offer and the whole board', async () => {
    await withRig(async (rig) => {
      const { state, seat } = seedAgentTurn(rig);
      expect(state.spawners.size).toBeGreaterThan(12);

      const result = await postDoor(
        rig,
        toolsCall('observe', { handle: inviteHandle(), full: true }),
        accessToken(rig, CAROL.sub),
      );
      const text = toolJson(result);
      const board = asRecord(text?.['board']);

      expect(text?.['stop']).toBe(false);
      expect(text?.['offer']).toBe(offerText(state, seat));
      expect(board['me']).toBe(String(seat));
      expect(board['activePlayer']).toBe(String(state.activePlayer));
      const territory = asRecord(board['territory']);
      const listed = Object.entries(territory).flatMap(([owner, arrows]) =>
        (arrows as string[]).map((arrow) => [arrow, owner] as const),
      );
      expect(new Map(listed)).toEqual(
        new Map([...state.territory].map(([arrow, owner]) => [String(arrow), String(owner)])),
      );
      expect(listed.length).toBe(state.territory.size);
      const trails = asRecord(board['trails']);
      for (const player of state.players) {
        expect([...((trails[String(player)] as string[] | undefined) ?? [])].sort()).toEqual(
          [...(state.trails.get(player) ?? [])].map(String).sort(),
        );
      }
      expect(board['groups']).toEqual(stateJsonOf(String(text?.['offer']))['groups']);
      const spawners = board['spawners'] as { vertex: string }[];
      expect(spawners.map((row) => row.vertex).sort()).toEqual(
        [...state.spawners.keys()].map(String).sort(),
      );
    });
  });

  it('observe without full is the compact P92 result', async () => {
    await withRig(async (rig) => {
      const { state, seat } = seedAgentTurn(rig);

      const result = await postDoor(
        rig,
        toolsCall('observe', { handle: inviteHandle() }),
        accessToken(rig, CAROL.sub),
      );
      const text = toolJson(result);

      expect(text).toEqual({ stop: false, offer: offerText(state, seat) });
      expect(text).not.toHaveProperty('board');
    });
  });

  it('tools/list documents full on observe', async () => {
    await withRig(async (rig) => {
      const result = await postDoor(
        rig,
        { jsonrpc: '2.0', id: 7, method: 'tools/list' },
        accessToken(rig, CAROL.sub),
      );
      const tools = asRecord(asRecord(jsonOf(result))['result'])['tools'] as {
        name: string;
        inputSchema: { properties: Record<string, { type?: string }>; required?: string[] };
      }[];
      const observe = tools.find((tool) => tool.name === 'observe');

      expect(observe?.inputSchema.properties['full']?.type).toBe('boolean');
      expect(observe?.inputSchema.required ?? []).not.toContain('full');
    });
  });
});
