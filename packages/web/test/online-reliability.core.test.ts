/**
 * P95 web core — the client is acknowledged, or catches up.
 *
 * @see docs/spec/online-reliability/online-reliability.web.core.feature
 * @see docs/spec/online-reliability/SCENARIOS.md
 */

import { describe, expect, it } from 'vitest';
import {
  batch,
  logScript,
  logWindow,
  mark,
  pass,
  sincesRequested,
  snapshotScript,
} from './online-move-log-replay.support';
import { ifMatches, posted, postStatus, postsOf, queued } from './online-turn-flow.support';
import { ALICE, quotedVersion } from './online-web.support';
import {
  sequentialIds,
  showingWith,
  snapshotReadsOf,
  submitIdsOf,
  versionScript,
} from './online-reliability.support';

describe('A submit is retried with its own id (D9)', () => {
  it('Every POST carries a submit id', async () => {
    const steps = [mark('s1'), mark('s2')];
    const h = await showingWith(
      4,
      [posted(5), posted(6), snapshotScript(6), logScript(logWindow(4, 6, steps))],
      { newId: sequentialIds() },
    );

    expect(await h.adapter.submitMoves(steps)).toBe('sent');

    expect(submitIdsOf(h)).toEqual(['id-1', 'id-2']);
  });

  it('A gateway timeout is retried with the same id and lands', async () => {
    const h = await showingWith(
      4,
      [postStatus(503), posted(5), snapshotScript(5), logScript(logWindow(4, 5, [pass()]))],
      { newId: sequentialIds() },
    );

    const outcome = await h.adapter.submitMoves([pass()]);

    expect(outcome).toBe('sent');
    expect(submitIdsOf(h)).toEqual(['id-1', 'id-1']);
    expect(ifMatches(h)).toEqual([quotedVersion(4), quotedVersion(4)]);
  });
});

describe('A 401 holds the submit (D10)', () => {
  it('The submit is sent after the next sign-in', async () => {
    const h = await showingWith(
      4,
      [
        postStatus(401),
        posted(5),
        snapshotScript(5),
        snapshotScript(5),
        logScript(logWindow(4, 5, [pass()])),
      ],
      { newId: sequentialIds() },
    );

    expect(await h.adapter.submitMoves([pass()])).toBe('unauthorized');
    expect(h.adapter.submitPending()).toBe(true);
    expect(h.gis.prompted).toBe(true);

    await h.adapter.deliverGoogleCredential(ALICE.bearer);

    expect(postsOf(h)).toBe(2);
    expect(submitIdsOf(h)).toEqual(['id-1', 'id-1']);
    expect(h.adapter.submitPending()).toBe(false);
  });
});

describe('Never miss a wake (D11)', () => {
  it('The poll reopens a closed socket', async () => {
    const h = await showingWith(4, [versionScript(4)]);
    expect(h.sockets).toHaveLength(1);
    h.sockets[0]?.drop();

    await h.adapter.poll();

    expect(h.sockets).toHaveLength(2);
    expect(h.sockets[1]?.closed).toBe(false);
  });

  it('A newer version from the poll takes the wake path', async () => {
    const moves = [mark('b1'), pass()];
    const h = await showingWith(4, [
      versionScript(6),
      snapshotScript(6),
      logScript(logWindow(4, 6, moves)),
    ]);

    await h.adapter.poll();

    expect(sincesRequested(h)).toEqual(['4']);
    expect(queued(h)).toEqual([batch(4, 6, moves)]);
  });
});

describe('Resume catches up (D12)', () => {
  it('Coming back reopens the socket and re-reads the game', async () => {
    const h = await showingWith(4, [snapshotScript(4)]);
    h.sockets[0]?.drop();
    const reads = snapshotReadsOf(h);

    await h.adapter.becomeVisible();

    expect(h.sockets).toHaveLength(2);
    expect(snapshotReadsOf(h)).toBe(reads + 1);
  });
});
