/**
 * P94 replay — a submit's window, played from the displayed position through the
 * real rules, reproduces the position after the client's move and the burst.
 *
 * @see docs/spec/online-turn-flow/online-turn-flow.md
 */

import { endTurn } from '@conquarrow/contracts';
import { replay } from '@conquarrow/rules-core';
import { describe, expect, it } from 'vitest';
import { commitSequence, stateDigest } from '../src/online-replay';
import {
  firstLegalStep,
  logScript,
  logWindow,
  openingThree,
  rules,
  snapshotScript,
} from './online-move-log-replay.support';
import { posted, queued, showingAt } from './online-turn-flow.support';

describe('A submit replays the client’s move and every seat after it', () => {
  it('step + End turn, then two seats pass, replays back to the client’s seat', async () => {
    const opening = openingThree();
    const step = firstLegalStep(opening);
    const mine = [step, endTurn()];
    const burst = [endTurn(), endTurn()];
    const all = [...mine, ...burst];
    const h = await showingAt(0, [
      posted(1),
      posted(2),
      snapshotScript(2),
      logScript(logWindow(0, 2, all)),
    ]);

    await h.adapter.submitMoves(mine);

    const replayed = replay(rules, opening, commitSequence(queued(h)));
    const expected = all.reduce((state, move) => rules.apply(state, move), opening);
    expect(stateDigest(replayed)).toBe(stateDigest(expected));
    expect(String(replayed.activePlayer)).toBe(String(opening.activePlayer));
  });
});
