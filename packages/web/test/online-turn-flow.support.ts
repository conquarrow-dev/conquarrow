/**
 * Fixtures for the P94 turn-flow suite. Builds on the P19 pages fakes and the
 * P49 log fixtures — same injected fetch, socket, session and location.
 *
 * @see docs/spec/online-turn-flow/online-turn-flow.md
 */

import type { OnlinePagesHttpResponse, ReplayBatch } from '@conquarrow/contracts';
import { makeHostHarness, type HostHarness } from './online-shell.support';
import {
  ALICE,
  GAME_ONE,
  GROUP_HASH,
  apiCalls,
  boardAt,
  gameHash,
  ifMatchOf,
  makePagesHarness,
  postMoveScript,
  type FetchSpy,
  type PagesHarness,
  type ScriptedFetch,
} from './online-web.support';
import { snapshotScript } from './online-move-log-replay.support';

export const MOVES_PATH = `/games/${GROUP_HASH}/${GAME_ONE}/moves`;
export const GAME_PATH = `/games/${GROUP_HASH}/${GAME_ONE}`;

/** A 200 for a POST that produced `version`. */
export const posted = (version: number): ScriptedFetch =>
  postMoveScript(200, { version, groupHash: GROUP_HASH, gameNumber: GAME_ONE });

/** A POST answered with `status` and an error body. */
export const postStatus = (status: number): ScriptedFetch =>
  postMoveScript(status, { error: `status-${String(status)}` });

/** A POST whose fetch is rejected — a dropped connection, an offline phone. */
export const postRejected = (): ScriptedFetch => ({
  method: 'POST',
  path: MOVES_PATH,
  status: 0,
  reject: new Error('network down'),
});

/** A snapshot GET whose fetch is rejected. */
export const snapshotRejected = (): ScriptedFetch => ({
  method: 'GET',
  path: GAME_PATH,
  status: 0,
  reject: new Error('network down'),
});

/** A POST the test answers by hand, to observe the submit while it is in flight. */
export const heldPost = (): {
  readonly script: ScriptedFetch;
  readonly answer: (version: number) => void;
} => {
  let resolve: ((res: OnlinePagesHttpResponse) => void) | undefined;
  const deferred = new Promise<OnlinePagesHttpResponse>((r) => {
    resolve = r;
  });
  return {
    script: { method: 'POST', path: MOVES_PATH, status: 0, deferred },
    answer: (version) => {
      resolve?.({
        status: 200,
        body: JSON.stringify({ version, groupHash: GROUP_HASH, gameNumber: GAME_ONE }),
      });
    },
  };
};

/**
 * A's client in the open game, showing `baseline`: booted onto the snapshot at
 * that version and reporting it displayed, as App does after an install.
 */
export const showingAt = async (
  baseline: number,
  fetchScript: readonly ScriptedFetch[],
): Promise<PagesHarness> => {
  const h = makePagesHarness({
    hash: gameHash(GROUP_HASH, GAME_ONE),
    sessionToken: ALICE.bearer,
    fetchScript: [snapshotScript(baseline), ...fetchScript],
  });
  await h.adapter.boot();
  h.adapter.noteDisplayed(baseline);
  return h;
};

/** The same, through the host (for `illegal()`). */
export const hostShowingAt = async (
  baseline: number,
  fetchScript: readonly ScriptedFetch[],
): Promise<HostHarness> => {
  const h = makeHostHarness({
    hash: gameHash(GROUP_HASH, GAME_ONE),
    sessionToken: ALICE.bearer,
    fetchScript: [snapshotScript(baseline), ...fetchScript],
  });
  await h.host.boot();
  h.host.adapter().noteDisplayed(baseline);
  return h;
};

export const postsOf = (h: FetchSpy): number => apiCalls(h, 'POST', MOVES_PATH).length;

export const ifMatches = (h: FetchSpy): readonly (string | undefined)[] =>
  apiCalls(h, 'POST', MOVES_PATH).map(ifMatchOf);

export const snapshotReads = (h: FetchSpy): number => apiCalls(h, 'GET', GAME_PATH).length;

export const queued = (h: PagesHarness): readonly ReplayBatch[] => h.adapter.pendingReplays();

export const finishedAt = (version: number): ScriptedFetch => ({
  method: 'GET',
  path: GAME_PATH,
  status: 200,
  body: boardAt(version, { winner: 'A', tag: `won-v${String(version)}` }),
});

export const othersTurnAt = (version: number): ScriptedFetch => ({
  method: 'GET',
  path: GAME_PATH,
  status: 200,
  body: { ...boardAt(version, { activePlayer: 'B', tag: `b-v${String(version)}` }), seats: [
    { kind: 'human', userHash: ALICE.userHash },
    { kind: 'human', userHash: 'bob-user-hash' },
    { kind: 'heuristic' },
  ] },
});
