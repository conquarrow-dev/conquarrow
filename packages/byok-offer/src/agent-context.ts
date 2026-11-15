/**
 * What a model sees for a turn, for the MCP door and the web BYOK seat alike
 * (P93 decision 13). One builder, so the two paths cannot drift: the door
 * writes it as result blocks, the BYOK seat as one user message.
 *
 * @see docs/spec/agent-board-map/agent-board-map.md#one-agent-context-the-door-and-the-byok-seat
 */

import type { GameState, GeometryPort, PlayerId } from '@conquarrow/contracts';
import { boardMap, boardView, type BoardView } from './board';

/** The `board` argument: what to add beside the offer. */
export const BOARD_OPTIONS = ['off', 'json', 'ascii', 'both'] as const;
export type BoardOption = (typeof BOARD_OPTIONS)[number];

export interface AgentContext {
  readonly offer: string;
  readonly board?: BoardView;
  readonly map?: string;
}

export const agentContext = (
  offer: string,
  geometry: GeometryPort,
  state: GameState,
  seat: PlayerId,
  option: BoardOption,
): AgentContext => {
  if (option === 'off') return { offer };
  const board = boardView(geometry, state, seat);
  const map = option === 'json' ? {} : { map: boardMap(board) };
  return option === 'ascii' ? { offer, ...map } : { offer, board, ...map };
};

/** One message for a chat model: board JSON, then the map, then the offer, so the reply instruction is last. */
export const agentPromptText = (context: AgentContext): string => {
  const sections: string[] = [];
  if (context.board !== undefined) sections.push(`BOARD_JSON:\n${JSON.stringify(context.board)}\n`);
  if (context.map !== undefined) {
    sections.push(
      `BOARD_MAP (whole board; legend in the system prompt and at the top of the map):\n${context.map}`,
    );
  }
  return [...sections, context.offer].join('\n');
};
