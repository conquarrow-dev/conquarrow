/**
 * docs/spec/online-reliability/online-reliability.server.edge-cases.feature — one test per scenario.
 *
 * @see docs/spec/online-reliability/online-reliability.md
 */

import { describe, expect, it } from 'vitest';
import { endTurn } from '@conquarrow/contracts';
import { createWsHandler } from '../src/ws-event';
import { ADVANCE_BUDGET_MS } from '../src/game-advance';
import {
  ALICE,
  BOB,
  CAROL,
  GAME_ONE,
  aliceBobGroupHash,
  aliceFayGroupHash,
  expectStatus,
  firstLegalStep,
  gameLogKey,
  getGame,
  makeHarness,
  openingMatch,
  overlappingGetStore,
  postMove,
  startAliceBob,
  startAliceFayBurst,
  storedVersion,
} from './support';
import { bodyOf, getVersion, movesAt, postWithId } from './online-reliability.support';

const opened = async (): Promise<ReturnType<typeof makeHarness> & { groupHash: string }> => {
  const harness = makeHarness();
  await startAliceBob(harness.api);
  const groupHash = aliceBobGroupHash();
  expectStatus(await getGame(harness.api, groupHash, GAME_ONE, ALICE.bearer), 200);
  return { ...harness, groupHash };
};

describe('online-reliability server edge cases', () => {
  it('A submit id from another user is not a duplicate', async () => {
    const { api, groupHash, s3 } = await opened();
    const move = firstLegalStep(openingMatch(3));
    expectStatus(await postWithId(api, groupHash, GAME_ONE, ALICE.bearer, move, 0, 's-1'), 200);

    const res = await postWithId(api, groupHash, GAME_ONE, BOB.bearer, move, 0, 's-1');

    expectStatus(res, 412);
    expect(bodyOf(res)).not.toHaveProperty('duplicate');
    expect(storedVersion(s3, groupHash, GAME_ONE)).toBe(1);
  });

  it('A malformed submit id is unprocessable', async () => {
    const { api, groupHash, s3 } = await opened();
    const before = [...s3.entries()];

    const res = await postWithId(
      api,
      groupHash,
      GAME_ONE,
      ALICE.bearer,
      firstLegalStep(openingMatch(3)),
      0,
      'x'.repeat(65),
    );

    expectStatus(res, 422);
    expect([...s3.entries()]).toEqual(before);
  });

  it('A duplicate after the game moved on still answers its own version', async () => {
    const { api, groupHash } = await opened();
    expectStatus(await postWithId(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0, 's-1'), 200);

    const res = await postWithId(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0, 's-1');

    expectStatus(res, 200);
    expect(bodyOf(res)['version']).toBe(1);
    expect(bodyOf(res)['duplicate']).toBe(true);
  });

  it('A lost race won by the same submit is a duplicate', async () => {
    const data = new Map<string, string>();
    const store = overlappingGetStore(data, (key) => key.endsWith('/state.json'));
    const { api } = makeHarness({ s3: data, store });
    await startAliceBob(api);
    const groupHash = aliceBobGroupHash();
    expectStatus(await getGame(api, groupHash, GAME_ONE, ALICE.bearer), 200);
    const move = firstLegalStep(openingMatch(3));
    store.arm();

    const [left, right] = await Promise.all([
      postWithId(api, groupHash, GAME_ONE, ALICE.bearer, move, 0, 's-1'),
      postWithId(api, groupHash, GAME_ONE, ALICE.bearer, move, 0, 's-1'),
    ]);

    expectStatus(left, 200);
    expectStatus(right, 200);
    expect([bodyOf(left)['version'], bodyOf(right)['version']]).toEqual([1, 1]);
    expect([bodyOf(left)['duplicate'], bodyOf(right)['duplicate']].filter((d) => d === true)).toHaveLength(1);
    expect(movesAt(data.get(gameLogKey(groupHash, GAME_ONE)), 1)).toEqual([move]);
  });

  it('The advance stops at its budget and the next read continues it', async () => {
    let now = 0;
    const tick = Math.ceil((ADVANCE_BUDGET_MS * 3) / 4);
    const { api, s3 } = makeHarness({
      clock: () => now,
      heuristic: () => {
        now += tick;
        return endTurn();
      },
    });
    await startAliceFayBurst(api);
    const groupHash = aliceFayGroupHash();
    expectStatus(await getGame(api, groupHash, GAME_ONE, ALICE.bearer), 200);
    const players = openingMatch(6).players.map(String);

    const res = await postMove(api, groupHash, GAME_ONE, ALICE.bearer, endTurn(), 0);

    expectStatus(res, 200);
    expect(movesAt(s3.get(gameLogKey(groupHash, GAME_ONE)), 1)).toHaveLength(3);
    const after = await getGame(api, groupHash, GAME_ONE, ALICE.bearer);
    expect(bodyOf(after)['version']).toBe(2);
    expect(movesAt(s3.get(gameLogKey(groupHash, GAME_ONE)), 2)).toHaveLength(2);
    const state = bodyOf(after)['state'] as Record<string, unknown>;
    expect(state['activePlayer']).toBe(players[5]);
  });

  it('A read that needs no advance writes nothing', async () => {
    const { api, groupHash, s3, notifies } = await opened();
    const before = [...s3.entries()];
    const woken = notifies.length;

    expectStatus(await getGame(api, groupHash, GAME_ONE, ALICE.bearer), 200);
    expectStatus(await getVersion(api, groupHash, GAME_ONE, ALICE.bearer), 200);

    expect([...s3.entries()]).toEqual(before);
    expect(notifies).toHaveLength(woken);
  });

  it('The version read refuses a non-member', async () => {
    const { api, groupHash } = await opened();

    expectStatus(await getVersion(api, groupHash, GAME_ONE, CAROL.bearer), 403);
  });

  it('The heartbeat route answers', async () => {
    const { ws } = makeHarness();
    const handle = createWsHandler(ws);

    const result = await handle({ requestContext: { connectionId: 'c-1', routeKey: '$default' } });

    expect(result.statusCode).toBe(200);
  });

  it('Payload sizes are logged', async () => {
    const lines: string[] = [];
    const { api } = makeHarness({ log: (line) => lines.push(line) });
    await startAliceBob(api);
    const groupHash = aliceBobGroupHash();
    lines.length = 0;

    const res = await getGame(api, groupHash, GAME_ONE, ALICE.bearer);

    const parsed = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(parsed).toContainEqual({
      http: 'GET get-game',
      status: 200,
      bytes: Buffer.byteLength(res.body, 'utf8'),
    });
    expect(lines.some((line) => line.includes(groupHash))).toBe(false);
  });
});
