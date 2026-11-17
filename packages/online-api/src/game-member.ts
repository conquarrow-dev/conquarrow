/**
 * Membership for the per-game routes: signed in, the game exists, and the
 * caller is bound to one of its seats.
 *
 * Its own module so that both `game-handlers` (GET/POST the position) and
 * `game-log` (P49's read route) can use it without importing each other.
 */

import type { InviteSeat, OnlineHttpResult, OnlineRequest } from '@conquarrow/contracts';
import type { ObjectStore, OnlineApiDeps } from './api-types';
import { authorizationOf, requireUserHash } from './auth';
import { isBoundMember, parseGameMeta, parseInvite, type GameMeta } from './invite-record';
import { forbidden, notFound } from './json-result';
import { gameMetaKey, inviteKey } from './s3-keys';
import { getObject } from './store-io';

export type MemberCheck =
  | {
      readonly ok: true;
      readonly userHash: string;
      readonly seats: readonly InviteSeat[];
      readonly meta: GameMeta;
    }
  | { readonly ok: false; readonly result: OnlineHttpResult };

export const readGameMeta = async (
  s3: ObjectStore,
  groupHash: string,
  gameNumber: string,
): Promise<GameMeta | undefined> => {
  const raw = await getObject(s3, gameMetaKey(groupHash, gameNumber));
  return raw === undefined ? undefined : parseGameMeta(raw);
};

/**
 * P96 D4: the game's owner — `ownerUserHash` from Start, else (pre-P96 meta)
 * the creator of the invite it was started from, else nobody.
 */
export const gameOwner = async (s3: ObjectStore, meta: GameMeta): Promise<string | undefined> => {
  if (meta.ownerUserHash !== undefined) return meta.ownerUserHash;
  if (meta.inviteToken === undefined) return undefined;
  const raw = await getObject(s3, inviteKey(meta.inviteToken));
  return raw === undefined ? undefined : parseInvite(raw)?.creatorUserHash;
};

export const requireMember = async (
  deps: OnlineApiDeps,
  request: OnlineRequest,
  groupHash: string,
  gameNumber: string,
): Promise<MemberCheck> => {
  const user = await requireUserHash(deps.google, authorizationOf(request));
  if (!user.ok) return user;
  const meta = await readGameMeta(deps.s3, groupHash, gameNumber);
  if (meta === undefined) return { ok: false, result: notFound() };
  if (!isBoundMember(meta.seats, user.userHash)) {
    return { ok: false, result: forbidden() };
  }
  return { ok: true, userHash: user.userHash, seats: meta.seats, meta };
};
