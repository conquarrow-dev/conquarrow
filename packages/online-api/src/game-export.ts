/**
 * P96 D1–D3 — the server's record of one game, for the browser route and the
 * agent door's `export` tool alike (one builder).
 *
 * @see docs/spec/game-management/game-management.md
 */

import type { OnlineHttpResult, OnlineRequest } from '@conquarrow/contracts';
import type { OnlineApiDeps } from './api-types';

export const handleGetExport = (
  deps: OnlineApiDeps,
  request: OnlineRequest,
  groupHash: string,
  gameNumber: string,
): Promise<OnlineHttpResult> => {
  void deps;
  void request;
  void groupHash;
  void gameNumber;
  throw new Error('P96: export is not implemented');
};
