/**
 * docs/spec/agent-board-map/agent-board-map.md#one-agent-context-the-door-and-the-byok-seat
 * — the shared agent context and the one legend text (decisions 13 and 15).
 *
 * @see docs/spec/agent-board-map/agent-board-map.core.feature
 */

import { describe, expect, it } from 'vitest';
import { MAP_LEGEND, agentContext, agentPromptText, boardMap, boardView, offerText } from '../src/index';
import { fixtureState, geometry } from './agent-board-map.support';

const seatB = () => {
  const state = fixtureState();
  const b = state.players[1];
  if (b === undefined) throw new Error('setup: no seat B');
  return { state, b };
};

describe('One agent context for the door and the BYOK seat', () => {
  it.each([
    { option: 'off' as const, board: false, map: false },
    { option: 'json' as const, board: true, map: false },
    { option: 'ascii' as const, board: false, map: true },
    { option: 'both' as const, board: true, map: true },
  ])('agentContext with $option carries the offer, and the board and map it asks for', ({ option, board, map }) => {
    const { state, b } = seatB();
    const offer = offerText(state, b);
    const view = boardView(geometry, state, b);

    const ctx = agentContext(offer, geometry, state, b, option);

    expect(ctx.offer).toBe(offer);
    expect(ctx.board).toEqual(board ? view : undefined);
    expect(ctx.map).toBe(map ? boardMap(view) : undefined);
  });

  it('agentPromptText puts the map section first and the offer last', () => {
    const { state, b } = seatB();
    const offer = offerText(state, b);
    const map = boardMap(boardView(geometry, state, b));

    const text = agentPromptText(agentContext(offer, geometry, state, b, 'ascii'));

    expect(text.startsWith('BOARD_MAP')).toBe(true);
    expect(text).toContain(`\n${map}`);
    expect(text.endsWith(offer)).toBe(true);
    expect(text.indexOf(map)).toBeLessThan(text.indexOf(offer));
    expect(text).not.toContain('BOARD_JSON');
  });

  it('agentPromptText with no map is the offer alone; with a board it adds a BOARD_JSON section before the map', () => {
    const { state, b } = seatB();
    const offer = offerText(state, b);

    expect(agentPromptText(agentContext(offer, geometry, state, b, 'off'))).toBe(offer);
    const both = agentPromptText(agentContext(offer, geometry, state, b, 'both'));
    expect(both.indexOf('BOARD_JSON')).toBeGreaterThanOrEqual(0);
    expect(both.indexOf('BOARD_JSON')).toBeLessThan(both.indexOf('BOARD_MAP'));
    expect(both).toContain(JSON.stringify(boardView(geometry, state, b)));
    expect(both.endsWith(offer)).toBe(true);
  });

  it('boardMap prints every MAP_LEGEND line under its header, and the header names the width', () => {
    const { state, b } = seatB();
    const lines = boardMap(boardView(geometry, state, b)).split('\n');

    expect(MAP_LEGEND.length).toBeGreaterThan(0);
    expect(lines.slice(1, 1 + MAP_LEGEND.length)).toEqual([...MAP_LEGEND]);
    expect(lines[0]).toMatch(/^map me=B active=B players=[A-H](,[A-H])*; \d+ characters per column, \d+ per arrow\.$/);
    for (const fixed of ['1/3', '1/9', '1/12']) expect(MAP_LEGEND.join('\n')).not.toContain(fixed);
  });
});
