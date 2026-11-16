/**
 * docs/spec/online-reliability/online-reliability.server.core.feature — one test per scenario.
 *
 * @see docs/spec/online-reliability/online-reliability.md
 */

import { describe, expect, it } from 'vitest';
import { endTurn, type GameState } from '@conquarrow/contracts';
import {
  ALICE,
  ALICE_CONN,
  BOB,
  BOB_CONN,
  GAME_ONE,
  activePlayerOf,
  aliceBobCarolGroupHash,
  aliceBobGroupHash,
  aliceHash,
  carolHash,
  expectStatus,
  firstLegalStep,
  gameLogKey,
  getGame,
  groupHashOfUserHashes,
  makeHarness,
  notifiesTo,
  openingMatch,
  postMove,
  startAliceBob,
  startAliceBobCarol,
  storedVersion,
  stateOfBody,
  wsConnect,
} from './support';
import {
  CAROL,
  TOKEN,
  accessToken,
  agent,
  atSeat,
  heuristicSeat,
  human,
  inviteHandle,
  logRaw,
  opening,
  postDoor,
  seedStarted,
  storedActive,
  storedVersion as rigVersion,
  toolJson,
  toolsCall,
  withNoLegalStep,
  withRig,
} from './remote-agent-mcp.support';
import {
  bodyOf,
  expectedStandings,
  getVersion,
  movesAt,
  postWithId,
  seatOneLost,
  seedEnvelope,
} from './online-reliability.support';

const A = (): string => aliceHash();
const GAME = '000001';

describe('A submit is applied at most once (D1)', () => {
  it('A repeated submit answers its version and applies nothing', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBob(api);
    const groupHash = aliceBobGroupHash();
    expectStatus(await getGame(api, groupHash, GAME_ONE, ALICE.bearer), 200);
    const move = firstLegalStep(openingMatch(3));
    const first = await postWithId(api, groupHash, GAME_ONE, ALICE.bearer, move, 0, 's-1');
    expectStatus(first, 200);
    expect(bodyOf(first)['version']).toBe(1);

    const again = await postWithId(api, groupHash, GAME_ONE, ALICE.bearer, move, 0, 's-1');

    expectStatus(again, 200);
    expect(bodyOf(again)['version']).toBe(1);
    expect(bodyOf(again)['duplicate']).toBe(true);
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(1);
    expect(movesAt(s3.get(gameLogKey(groupHash, GAME_ONE)), 1)).toEqual([move]);
  });
});

describe('The server plays every pass and every heuristic turn (D2)', () => {
  it('A lost seat is passed by the server', async () => {
    const { api, s3 } = makeHarness();
    await startAliceBobCarol(api);
    const groupHash = aliceBobCarolGroupHash();
    const state = seatOneLost();
    seedEnvelope(s3, groupHash, GAME_ONE, 0, state);

    const res = await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0);

    expectStatus(res, 200);
    expect(bodyOf(res)['version']).toBe(1);
    expect(movesAt(s3.get(gameLogKey(groupHash, GAME_ONE)), 1)).toEqual([endTurn(), endTurn()]);
    const read = await getGame(api, groupHash, GAME_ONE, ALICE.bearer);
    expect(activePlayerOf(stateOfBody(bodyOf(read)))).toBe(String(state.players[2]));
  });

  it('A pass-only agent seat is passed on the next read', async () => {
    await withRig(async (rig) => {
      const groupHash = groupHashOfUserHashes([A()]);
      const state = withNoLegalStep(atSeat(opening(3), 1));
      seedStarted(rig, {
        token: TOKEN,
        groupHash,
        gameNumber: GAME,
        seats: [human(A()), agent(carolHash()), heuristicSeat()],
        state,
        version: 3,
        members: [A(), carolHash()],
      });

      const res = await getGame(rig.api, groupHash, GAME, ALICE.bearer);

      expectStatus(res, 200);
      expect(bodyOf(res)['version']).toBe(4);
      expect(rigVersion(rig, groupHash, GAME)).toBe(4);
      expect(storedActive(rig, groupHash, GAME)).not.toBe(String(state.players[1]));
      expect(movesAt(logRaw(rig, groupHash, GAME), 4)[0]).toEqual(endTurn());
    });
  });
});

describe('The browser door moves only a human seat (D3)', () => {
  it("A human POST on the agent seat's turn is refused", async () => {
    await withRig(async (rig) => {
      const groupHash = groupHashOfUserHashes([A()]);
      const state = atSeat(opening(3), 1);
      seedStarted(rig, {
        token: TOKEN,
        groupHash,
        gameNumber: GAME,
        seats: [human(A()), agent(A()), heuristicSeat()],
        state,
        version: 2,
        members: [A()],
      });
      const before = [...rig.data.entries()];

      const res = await postMove(rig.api, groupHash, GAME, ALICE.bearer, firstLegalStep(state), 2);

      expectStatus(res, 403);
      expect(bodyOf(res)['reason']).toBe('agent-seat');
      expect([...rig.data.entries()]).toEqual(before);
    });
  });
});

describe('A finished game says how it ended (D4)', () => {
  const finishedSeed = (rig: Parameters<Parameters<typeof withRig>[0]>[0]): GameState => {
    const base = atSeat(opening(3), 1);
    const state: GameState = { ...base, winner: base.players[0] };
    seedStarted(rig, {
      token: TOKEN,
      groupHash: groupHashOfUserHashes([A()]),
      gameNumber: GAME,
      seats: [human(A()), agent(carolHash()), heuristicSeat()],
      state,
      version: 2,
      members: [A(), carolHash()],
      log: [
        JSON.stringify({ v: 1, move: endTurn() }),
        JSON.stringify({ v: 2, agentReply: { moves: [], endTurn: true } }),
        JSON.stringify({ v: 2, move: endTurn() }),
        '',
      ].join('\n'),
    });
    return state;
  };

  it("A finished game's GET carries the summary", async () => {
    await withRig(async (rig) => {
      const state = finishedSeed(rig);

      const res = await getGame(rig.api, groupHashOfUserHashes([A()]), GAME, ALICE.bearer);

      expectStatus(res, 200);
      const summary = bodyOf(res)['summary'] as Record<string, unknown>;
      expect(summary['winner']).toBe(String(state.players[0]));
      expect(summary['turns']).toBe(2);
      expect(summary['standings']).toEqual(
        expectedStandings(state, ['human', 'agent', 'heuristic']),
      );
    });
  });

  it("A finished game's version read names the winner", async () => {
    await withRig(async (rig) => {
      const state = finishedSeed(rig);

      const res = await getVersion(rig.api, groupHashOfUserHashes([A()]), GAME, ALICE.bearer);

      expectStatus(res, 200);
      expect(bodyOf(res)['winner']).toBe(String(state.players[0]));
    });
  });

  it('Observe on a finished game carries the summary', async () => {
    await withRig(async (rig) => {
      const state = finishedSeed(rig);

      const result = await postDoor(
        rig,
        toolsCall('observe', { handle: inviteHandle() }),
        accessToken(rig, CAROL.sub),
      );
      const text = toolJson(result);

      expect(text?.['stop']).toBe(true);
      expect(text?.['reason']).toBe('game-over');
      const summary = text?.['summary'] as Record<string, unknown> | undefined;
      expect(summary?.['winner']).toBe(String(state.players[0]));
      expect(summary?.['turns']).toBe(2);
    });
  });
});

describe('A cheap version read (D5)', () => {
  it('The version read answers the version and the active seat', async () => {
    const { api } = makeHarness();
    await startAliceBob(api);
    const groupHash = aliceBobGroupHash();
    expectStatus(await getGame(api, groupHash, GAME_ONE, ALICE.bearer), 200);

    const res = await getVersion(api, groupHash, GAME_ONE, ALICE.bearer);

    expectStatus(res, 200);
    const body = bodyOf(res);
    expect(body['version']).toBe(0);
    expect(body['activePlayer']).toBe(String(openingMatch(3).players[0]));
    expect(body).not.toHaveProperty('state');
    expect(body).not.toHaveProperty('winner');
  });
});

describe('Every device wakes (D6)', () => {
  it("The caller's other connection is woken", async () => {
    const { api, ws, notifies } = makeHarness();
    await startAliceBob(api);
    const groupHash = aliceBobGroupHash();
    expectStatus(await getGame(api, groupHash, GAME_ONE, ALICE.bearer), 200);
    expect((await wsConnect(ws, ALICE_CONN, ALICE.bearer)).statusCode).toBe(200);
    expect((await wsConnect(ws, 'conn-alice-2', ALICE.bearer)).statusCode).toBe(200);
    expect((await wsConnect(ws, BOB_CONN, BOB.bearer)).statusCode).toBe(200);

    expectStatus(await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0), 200);

    for (const conn of [ALICE_CONN, 'conn-alice-2', BOB_CONN]) {
      expect(notifiesTo(notifies, conn).map((row) => row.payload.version)).toContain(1);
    }
  });
});
