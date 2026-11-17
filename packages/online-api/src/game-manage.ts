/**
 * P96 D4–D6, D9 — delete, rename and hide one game.
 *
 * @see docs/spec/game-management/game-management.md
 * @see docs/adr/0012-game-owner-delete-hide.md
 */

import type { LibraryChangedPayload, OnlineHttpResult, OnlineRequest } from '@conquarrow/contracts';
import { DELETE_GAME_CONFIRM, normalizeGameName } from '@conquarrow/contracts';
import type { ObjectStore, OnlineApiDeps } from './api-types';
import { isPreconditionFailed } from './api-types';
import { parsePersistedEnvelope } from './game-snapshot';
import { gameOwner, requireMember } from './game-member';
import {
  asRecord,
  boundAgentHashes,
  boundHumanHashes,
  parseInvite,
  serializeInvite,
  type GameMeta,
} from './invite-record';
import { forbidden, jsonResult, notFound, unprocessable } from './json-result';
import { notifyUsers } from './notify';
import {
  gameMetaKey,
  gamePrefix,
  gamesPrefix,
  gameStateKey,
  hiddenKey,
  inviteKey,
  lobbyKey,
  userGroupKey,
} from './s3-keys';
import { deleteObject, getObject, listObjects, putObject } from './store-io';

export type ManageAction = 'delete' | 'name' | 'hide';

type Member = Extract<Awaited<ReturnType<typeof requireMember>>, { ok: true }>;

const bodyRecord = (body: string | undefined): Record<string, unknown> | undefined => {
  if (body === undefined) return undefined;
  try {
    return asRecord(JSON.parse(body) as unknown);
  } catch {
    return undefined;
  }
};

/** Every user bound to the game: its humans and its agents' owners. */
const membersOf = (meta: GameMeta): readonly string[] => [
  ...new Set([...boundHumanHashes(meta.seats), ...boundAgentHashes(meta.seats)]),
];

const wakeMembers = async (
  deps: OnlineApiDeps,
  meta: GameMeta,
  payload: LibraryChangedPayload,
): Promise<void> => {
  try {
    await notifyUsers(deps.s3, deps.postToConnection, membersOf(meta), payload, deps.log);
  } catch {
    return;
  }
};

const MATERIAL_META = /\/games\/\d{6}\/meta\.json$/;

/** D5: the invite says `deleted`, and nobody's lobby lists it any more. */
const retireInvite = async (s3: ObjectStore, token: string): Promise<void> => {
  const raw = await getObject(s3, inviteKey(token));
  const invite = raw === undefined ? undefined : parseInvite(raw);
  if (invite === undefined) return;
  for (const hash of new Set([invite.creatorUserHash, ...boundHumanHashes(invite.seats), ...boundAgentHashes(invite.seats)])) {
    await deleteObject(s3, lobbyKey(hash, token));
  }
  await putObject(s3, inviteKey(token), serializeInvite({ ...invite, status: 'deleted' }));
};

/** D5: meta first (so every route answers 404 at once), then the rest. */
const deleteGame = async (
  deps: OnlineApiDeps,
  member: Member,
  groupHash: string,
  gameNumber: string,
): Promise<OnlineHttpResult> => {
  const { s3 } = deps;
  const { meta } = member;
  await deleteObject(s3, gameMetaKey(groupHash, gameNumber));
  for (const key of await listObjects(s3, gamePrefix(groupHash, gameNumber))) {
    await deleteObject(s3, key);
  }
  const members = membersOf(meta);
  for (const hash of members) await deleteObject(s3, hiddenKey(hash, groupHash, gameNumber));
  if (meta.inviteToken !== undefined) await retireInvite(s3, meta.inviteToken);
  const left = (await listObjects(s3, gamesPrefix(groupHash))).filter((key) => MATERIAL_META.test(key));
  if (left.length === 0) {
    for (const hash of members) await deleteObject(s3, userGroupKey(hash, groupHash));
  }
  await wakeMembers(deps, meta, { type: 'libraryChanged', groupHash, gameNumber, change: 'deleted' });
  return jsonResult(200, { deleted: true });
};

const RENAME_TRIES = 3;

/** D6: the meta is rewritten with the name (or without it); a lost race retries. */
const renameGame = async (
  deps: OnlineApiDeps,
  member: Member,
  groupHash: string,
  gameNumber: string,
  name: string | undefined,
): Promise<OnlineHttpResult> => {
  const key = gameMetaKey(groupHash, gameNumber);
  for (let attempt = 0; attempt < RENAME_TRIES; attempt += 1) {
    const raw = await getObject(deps.s3, key);
    const rec = raw === undefined ? undefined : bodyRecord(raw);
    if (raw === undefined || rec === undefined) return notFound();
    const { name: _old, ...rest } = rec;
    const body = JSON.stringify(name === undefined ? rest : { ...rest, name });
    try {
      await putObject(deps.s3, key, body, { ifMatch: raw });
    } catch (error: unknown) {
      if (isPreconditionFailed(error)) continue;
      throw error;
    }
    await wakeMembers(deps, member.meta, { type: 'libraryChanged', groupHash, gameNumber, change: 'renamed' });
    return jsonResult(200, name === undefined ? {} : { name });
  }
  return jsonResult(409, { error: 'conflict' });
};

/** D9: won, by the stamped meta or (unstamped) the position. */
const isFinished = async (s3: ObjectStore, meta: GameMeta, groupHash: string, gameNumber: string): Promise<boolean> => {
  if (meta.winner !== undefined) return true;
  const raw = await getObject(s3, gameStateKey(groupHash, gameNumber));
  const persisted = raw === undefined ? undefined : parsePersistedEnvelope(raw);
  return persisted?.game.winner !== undefined;
};

const hideGame = async (
  deps: OnlineApiDeps,
  member: Member,
  groupHash: string,
  gameNumber: string,
  hidden: boolean,
): Promise<OnlineHttpResult> => {
  const key = hiddenKey(member.userHash, groupHash, gameNumber);
  if (!hidden) {
    await deleteObject(deps.s3, key);
    return jsonResult(200, { hidden });
  }
  if (!(await isFinished(deps.s3, member.meta, groupHash, gameNumber))) {
    return jsonResult(409, { error: 'conflict', reason: 'not-finished' });
  }
  await putObject(deps.s3, key, '{}');
  return jsonResult(200, { hidden });
};

/** `POST /games/{g}/{n}/delete|name|hide`. */
export const handleManageGame = async (
  deps: OnlineApiDeps,
  request: OnlineRequest,
  action: ManageAction,
  groupHash: string,
  gameNumber: string,
): Promise<OnlineHttpResult> => {
  const member = await requireMember(deps, request, groupHash, gameNumber);
  if (!member.ok) return member.result;
  const body = bodyRecord(request.body);
  if (action === 'hide') {
    const hidden = body?.['hidden'];
    if (typeof hidden !== 'boolean') return unprocessable();
    return hideGame(deps, member, groupHash, gameNumber, hidden);
  }
  if ((await gameOwner(deps.s3, member.meta)) !== member.userHash) return forbidden();
  if (action === 'delete') {
    if (body?.['confirm'] !== DELETE_GAME_CONFIRM) return unprocessable();
    return deleteGame(deps, member, groupHash, gameNumber);
  }
  if (body === undefined) return unprocessable();
  const named = normalizeGameName(body['name']);
  if (!named.ok) return unprocessable();
  return renameGame(deps, member, groupHash, gameNumber, named.name);
};
