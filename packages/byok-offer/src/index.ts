/**
 * Pure BYOK offer text and reply parser (P92).
 *
 * No React, no fetch, no clock, no Math.random. The web seat's HTTP call to a
 * model stays in web. One builder, one parser.
 *
 * @see docs/spec/remote-agent-mcp/remote-agent-mcp.md
 */

export {
  PLAN_CAP,
  annotateMove,
  baselineIndexFromTags,
  buildUserPrompt,
  clearByokPlans,
  dirtClosesFromRows,
  formatLegalMoves,
  isDirtClose,
  isFullStackClose,
  isTagChasePlan,
  millOmit,
  movesForLlm,
  offerText,
  rememberByokPlan,
  snapshotForPrompt,
  threatLineFromCounts,
  type ByokPlanBatch,
  type OfferTagRow,
  type OfferTarget,
  type ThreatLineInput,
} from './prompt';
export {
  asUsableBatch,
  parseMoveBatch,
  parseMoveBatchResult,
  parseReply,
  unusableReplyError,
  type ParsedBatchResult,
  type ParsedMoveBatch,
  type ParsedReply,
} from './parse';
export {
  MAP_LEGEND,
  boardMap,
  boardView,
  parseBoardView,
  type BoardGroupRow,
  type BoardSpawnerRow,
  type BoardView,
} from './board';
export {
  BOARD_OPTIONS,
  agentContext,
  agentPromptText,
  type AgentContext,
  type BoardOption,
} from './agent-context';
