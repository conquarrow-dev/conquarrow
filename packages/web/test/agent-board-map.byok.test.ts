/**
 * docs/spec/agent-board-map/agent-board-map.core.feature — "The web BYOK seat
 * sends the offer as plain text" (invariant 11). The door sends the offer as
 * its own text block; the web seat sends the same text as the user message of
 * its chat request, unwrapped.
 *
 * @see docs/spec/agent-board-map/agent-board-map.md#result-blocks
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildUserPrompt, clearByokPlans, movesForLlm } from '@conquarrow/byok-offer';
import { playLlmBotTurn } from '../src/byokBot';
import { clearTargetLocks, syncTargetLocks } from '../src/targets';
import {
  batchJson,
  geometry,
  mockChat,
  openingThree,
  postedMessage,
  readyConfig,
  rules,
} from './byok-batch-turn.support';

afterEach(() => {
  vi.restoreAllMocks();
  clearByokPlans();
  clearTargetLocks();
});

describe('The web BYOK seat sends the offer as plain text', () => {
  it('The user message is the offer text the seat built, and the reply is applied', async () => {
    const { state, me } = openingThree();
    const config = readyConfig();
    clearByokPlans();
    clearTargetLocks();
    const targets = syncTargetLocks(geometry, rules, state, me);
    const expected = buildUserPrompt(
      geometry,
      state,
      me,
      movesForLlm(rules.legalMoves(state)),
      config.reasoning,
      rules,
      targets,
    );
    clearByokPlans();
    clearTargetLocks();
    const spy = mockChat([batchJson([0], true)]);

    const result = await playLlmBotTurn(geometry, rules, state, me, config, spy);
    const user = postedMessage(spy, 'user');

    expect(user).toBe(expected);
    expect(user).toContain('\n');
    expect(user).not.toContain('\\n');
    expect(user).toContain('Reply with only JSON');
    expect(user.startsWith(`Seat ${String(me)}.`)).toBe(true);
    expect(result.llmHits).toBe(1);
    expect(result.llmFallbacks).toBe(0);
    expect(result.moves[0]).toEqual(movesForLlm(rules.legalMoves(state))[0]);
  });
});
