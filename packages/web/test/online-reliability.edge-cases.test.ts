/**
 * P95 web edge cases.
 *
 * @see docs/spec/online-reliability/online-reliability.web.edge-cases.feature
 */

import { describe, expect, it } from 'vitest';
import { submitNote } from '../src/online-submit';
import { pass, snapshotScript, wake } from './online-move-log-replay.support';
import { heldPost, postRejected, postStatus, postsOf } from './online-turn-flow.support';
import {
  myGamesScript,
  sequentialIds,
  showingWith,
  snapshotReadsOf,
  submitIdsOf,
  tokenExpiringAt,
  versionReads,
  versionScript,
} from './online-reliability.support';

const NOW = 1_800_000_000_000;

describe('online-reliability web edge cases', () => {
  it('A refusal is not retried', async () => {
    const h = await showingWith(4, [postStatus(409), snapshotScript(4)]);

    expect(await h.adapter.submitMoves([pass()])).toBe('stale');

    expect(postsOf(h)).toBe(1);
  });

  it('Retries are bounded', async () => {
    const h = await showingWith(
      4,
      [postRejected(), postRejected(), postRejected(), postRejected(), snapshotScript(4)],
      { newId: sequentialIds() },
    );

    expect(await h.adapter.submitMoves([pass()])).toBe('failed');

    expect(submitIdsOf(h)).toEqual(['id-1', 'id-1', 'id-1']);
  });

  it('A 403 is reported as not your seat', async () => {
    const h = await showingWith(4, [postStatus(403), snapshotScript(4)]);

    expect(await h.adapter.submitMoves([pass()])).toBe('forbidden');

    expect(submitNote('forbidden')).toMatch(/not yours/);
    expect(postsOf(h)).toBe(1);
  });

  it('A held submit is dropped on sign-out', async () => {
    const h = await showingWith(4, [postStatus(401)]);
    expect(await h.adapter.submitMoves([pass()])).toBe('unauthorized');
    expect(h.adapter.submitPending()).toBe(true);

    h.adapter.signOut();

    expect(h.adapter.submitPending()).toBe(false);
  });

  it('The poll sends nothing while a submit is in flight', async () => {
    const held = heldPost();
    const h = await showingWith(4, [held.script, versionScript(5), snapshotScript(5)]);
    const submit = h.adapter.submitMoves([pass()]);

    await h.adapter.poll();

    expect(versionReads(h)).toBe(0);
    held.answer(5);
    await submit;
  });

  it('The poll at the displayed version does nothing more', async () => {
    const h = await showingWith(4, [versionScript(4)]);
    const reads = snapshotReadsOf(h);

    await h.adapter.poll();

    expect(versionReads(h)).toBe(1);
    expect(snapshotReadsOf(h)).toBe(reads);
  });

  it('A token near expiry prompts once', async () => {
    const h = await showingWith(
      4,
      [snapshotScript(4), snapshotScript(4), myGamesScript(), myGamesScript()],
      { now: () => NOW },
      tokenExpiringAt(NOW + 2 * 60 * 1000),
    );
    const before = h.gis.promptCount;

    await h.adapter.becomeVisible();
    await h.adapter.becomeVisible();

    expect(h.gis.promptCount - before).toBe(1);
  });

  it('The heartbeat pings an open socket', () => {
    return showingWith(4, []).then((h) => {
      h.adapter.heartbeat();

      expect(h.sockets[0]?.sent).toEqual(['{"action":"ping"}']);
    });
  });

  it('A wake during a submit is left to the reconcile', async () => {
    const held = heldPost();
    const h = await showingWith(4, [held.script, snapshotScript(5), snapshotScript(5)]);
    const reads = snapshotReadsOf(h);
    const submit = h.adapter.submitMoves([pass()]);

    await h.adapter.receiveStateChanged(wake(5));

    expect(snapshotReadsOf(h)).toBe(reads);
    held.answer(5);
    await submit;
  });
});
