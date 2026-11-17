import type { InviteSeat, WsPayload } from '@conquarrow/contracts';
import type { ObjectStore, PostToConnection } from './api-types';
import { compareStrings } from './hashing';
import { connectionIdKey, connectionKey, connectionsPrefix } from './s3-keys';
import { deleteObject, listObjects } from './store-io';

const connectionIdOf = (key: string, prefix: string): string | undefined => {
  if (!key.startsWith(prefix)) return undefined;
  const rest = key.slice(prefix.length);
  if (rest.length === 0 || rest.includes('/')) return undefined;
  return rest;
};

const humanHashes = (seats: readonly InviteSeat[]): string[] => {
  const hashes: string[] = [];
  for (const seat of seats) {
    if (seat.kind !== 'human') continue;
    const hash = seat.userHash;
    if (hash === undefined) continue;
    hashes.push(hash);
  }
  return hashes;
};

/** P95 D7: how a wake reports its size. */
export type NotifyLog = ((line: string) => void) | undefined;

/**
 * P95 D6: wake every connection of every bound human, the caller's included —
 * one user's phone and laptop are two connections of one hash, and a client
 * already showing the version ignores it (P49 D4). `alsoUserHash` adds a user
 * who holds no human seat (an agent's owner, P92).
 */
export const notifyHumans = async (
  s3: ObjectStore,
  postToConnection: PostToConnection | undefined,
  seats: readonly InviteSeat[],
  payload: WsPayload,
  alsoUserHash?: string,
  log?: NotifyLog,
): Promise<void> => {
  const hashes = humanHashes(seats);
  if (alsoUserHash !== undefined) hashes.push(alsoUserHash);
  await notifyUsers(s3, postToConnection, hashes, payload, log);
};

/** Every connection of every listed user, each user once, in hash order. */
export const notifyUsers = async (
  s3: ObjectStore,
  postToConnection: PostToConnection | undefined,
  userHashes: readonly string[],
  payload: WsPayload,
  log?: NotifyLog,
): Promise<void> => {
  if (postToConnection === undefined) return;
  const hashes = [...new Set(userHashes)].sort(compareStrings);
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  for (const userHash of hashes) {
    const prefix = connectionsPrefix(userHash);
    const ids = (await listObjects(s3, prefix))
      .map((key) => connectionIdOf(key, prefix))
      .filter((id): id is string => id !== undefined)
      .sort(compareStrings);
    for (const connectionId of ids) {
      try {
        const status = await Promise.resolve(postToConnection(connectionId, payload));
        log?.(JSON.stringify({ ws: payload.type, bytes, status }));
        if (status === 410) {
          await deleteObject(s3, connectionKey(userHash, connectionId));
          await deleteObject(s3, connectionIdKey(connectionId));
        }
      } catch {
        continue;
      }
    }
  }
};
