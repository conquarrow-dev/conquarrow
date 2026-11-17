/**
 * P96 D4–D6, D9 — delete, rename and hide one game.
 *
 * @see docs/spec/game-management/game-management.md
 * @see docs/adr/0012-game-owner-delete-hide.md
 */

import type { OnlineHttpResult, OnlineRequest } from '@conquarrow/contracts';
import type { OnlineApiDeps } from './api-types';

export type ManageAction = 'delete' | 'name' | 'hide';

export const handleManageGame = (
  deps: OnlineApiDeps,
  request: OnlineRequest,
  action: ManageAction,
  groupHash: string,
  gameNumber: string,
): Promise<OnlineHttpResult> => {
  void deps;
  void request;
  void action;
  void groupHash;
  void gameNumber;
  throw new Error('P96: game management is not implemented');
};
