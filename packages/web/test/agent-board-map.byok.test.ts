/**
 * docs/spec/agent-board-map/agent-board-map.core.feature — "The web BYOK seat
 * gets the same board context as an MCP agent" (invariants 11-13). The seat
 * builds its user message from the shared agentContext: the map on the first
 * request of a seat-turn, the offer only on later requests.
 *
 * @see docs/spec/agent-board-map/agent-board-map.md#one-agent-context-the-door-and-the-byok-seat
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAP_LEGEND,
  agentContext,
  agentPromptText,
  boardMap,
  boardView,
  buildUserPrompt,
  clearByokPlans,
  movesForLlm,
} from '@conquarrow/byok-offer';
import { buildSystemPrompt, playLlmBotTurn } from '../src/byokBot';
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

const REPLY = 'Reply with only JSON';

afterEach(() => {
  vi.restoreAllMocks();
  clearByokPlans();
  clearTargetLocks();
});

describe('The web BYOK seat gets the same board context as an MCP agent', () => {
  it('The first request of a BYOK seat-turn carries the map, then the offer', async () => {
    const { state, me } = openingThree();
    const config = readyConfig();
    clearByokPlans();
    clearTargetLocks();
    const targets = syncTargetLocks(geometry, rules, state, me);
    const offer = buildUserPrompt(
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

    expect(user).toBe(agentPromptText(agentContext(offer, geometry, state, me, 'ascii')));
    expect(user.startsWith('BOARD_MAP')).toBe(true);
    expect(user).toContain(boardMap(boardView(geometry, state, me)));
    expect(user.trimEnd().split('\n').at(-1)).toContain(REPLY);
    expect(result.llmHits).toBe(1);
    expect(result.llmFallbacks).toBe(0);
    expect(result.moves[0]).toEqual(movesForLlm(rules.legalMoves(state))[0]);
  });

  it('A later request in the same seat-turn sends the offer only', async () => {
    const { state, me } = openingThree();
    const spy = mockChat([batchJson([0], false), batchJson([], true)]);

    await playLlmBotTurn(geometry, rules, state, me, readyConfig(), spy);

    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(postedMessage(spy, 'user', 0).startsWith('BOARD_MAP')).toBe(true);
    const second = postedMessage(spy, 'user', 1);
    expect(second).not.toContain('BOARD_MAP');
    expect(second).not.toContain('map me=');
    expect(second.startsWith(`Seat ${String(me)}.`)).toBe(true);
    expect(second).toContain(REPLY);
  });

  it('The BYOK system prompt carries the map legend', () => {
    const { me } = openingThree();
    for (const reasoning of [true, false]) {
      const system = buildSystemPrompt(me, reasoning);
      expect(system).toContain('BOARD_MAP');
      for (const line of MAP_LEGEND) expect(system).toContain(line);
    }
  });
});
