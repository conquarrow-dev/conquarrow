/**
 * Pages online adapter (P19). DOM-free facades so tests inject fake GIS,
 * fetch, WebSocket, and sessionStorage. The web package implements this.
 *
 * Google `sub` never appears on a DTO the adapter copies into a URL.
 *
 * @see docs/spec/online-web/online-web.md
 * @see docs/adr/0002-cheap-async-online.md
 */

import type { Move } from './move';
import type {
  GameNumber,
  GroupHash,
  InviteSeat,
  InviteToken,
  MyGamesBody,
  PlannedSeatKind,
  StateChangedPayload,
  UserHash,
} from './online-port';

/**
 * Browser-storage key for the cached Google ID token (ADR 0002 / P19). Since
 * P95 the cache is `localStorage`; it is a cache, never the authority (ADR 0011).
 */
export const GOOGLE_ID_TOKEN_SESSION_KEY = 'conquarrow:google-id-token';

export type PagesLobbyMode = 'local' | 'online';

/** Last successful GET `/games/:groupHash/:gameNumber` body. */
export interface OnlineGameBoard {
  readonly version: number;
  readonly state: unknown;
  /** Game meta chairs when the GET body includes them (P26). Optional so older fixtures still parse. */
  readonly seats?: readonly InviteSeat[];
}

/**
 * A contiguous run of persisted moves fetched to catch up (P49). `from` is the
 * displayed baseline the client asked from; `to` is the version the run produces.
 */
export interface ReplayBatch {
  readonly from: number;
  readonly to: number;
  readonly moves: readonly Move[];
}

/**
 * How one `submitMoves` call ended (P94 D5, P95 D9–D10). Decided by what stopped
 * the POST loop: every move answered 200 → `sent`; 422 → `illegal`; 409 or 412
 * → `stale`; 403 → `forbidden`; 401 → `unauthorized` (the rest is held and sent
 * after the next credential); retries spent on a rejected fetch or a 5xx, or any
 * other status → `failed`. `refused` means a guard stopped it before any request.
 */
export type SubmitOutcome =
  | 'sent'
  | 'refused'
  | 'illegal'
  | 'stale'
  | 'forbidden'
  | 'failed'
  | 'unauthorized';

export interface OnlinePagesEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_WS_URL: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
}

export interface OnlinePagesSession {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface OnlinePagesLocation {
  readonly origin: string;
  readonly pathname: string;
  hash: string;
}

export interface OnlinePagesHttpRequest {
  readonly url: string;
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface OnlinePagesHttpResponse {
  readonly status: number;
  readonly body: string;
}

export type OnlinePagesFetch = (
  request: OnlinePagesHttpRequest,
) => Promise<OnlinePagesHttpResponse>;

export interface OnlinePagesSocket {
  readonly url: string;
  close(): void;
  /** P95 D11: an outbound frame (the heartbeat). A closed socket drops it. */
  send(text: string): void;
}

/** P95 D11: what the adapter hears about the socket's life. */
export interface OnlinePagesSocketEvents {
  /** The socket closed, by either side. */
  readonly onClose: () => void;
}

/**
 * Opens the session socket. The host forwards inbound `stateChanged` JSON to
 * `receiveStateChanged` — the same inbound pattern as GIS → `deliverGoogleCredential`.
 */
export type OnlinePagesOpenSocket = (
  url: string,
  events: OnlinePagesSocketEvents,
) => OnlinePagesSocket;

/** Outbound: the adapter asks GIS to collect a credential. */
export interface OnlinePagesGis {
  /** One Tap — auto unsigned-invite / 401. */
  prompt(): void;
  /** User-gesture Sign-In after One Tap skip/dismiss (P27). */
  offerChooser(): void;
}

export interface OnlinePagesDeps {
  readonly env: OnlinePagesEnv;
  readonly session: OnlinePagesSession;
  readonly location: OnlinePagesLocation;
  readonly fetch: OnlinePagesFetch;
  readonly openSocket: OnlinePagesOpenSocket;
  readonly gis: OnlinePagesGis;
  /** P95 D9: a fresh submit id. Absent → `crypto.randomUUID()`. */
  readonly newId?: () => string;
  /** P95 D9: wait between retries. Absent → no wait. */
  readonly wait?: (ms: number) => Promise<void>;
  /** P95 D12: epoch ms, to read a token's `exp`. Absent → `Date.now()`. */
  readonly now?: () => number;
}

/**
 * Pages online adapter. Tests drive this port; a second implementation can
 * satisfy the same suite. I/O is observed on the injected fakes.
 */
export interface OnlinePagesPort {
  boot(): Promise<void>;
  selectMode(mode: PagesLobbyMode): void;
  setSeatPlan(seats: readonly PlannedSeatKind[]): void;
  createInvite(): Promise<void>;
  startLocalMatch(): void;
  startOnlineMatch(): Promise<void>;
  acceptInvite(): Promise<void>;
  /**
   * P94. POST the moves one commit names, in order, each `If-Match` the version
   * the previous POST reported; the first refusal stops the rest. Then take the
   * P49 wake path from the displayed baseline (replay or install). Never
   * rejects.
   */
  submitMoves(moves: readonly Move[]): Promise<SubmitOutcome>;
  /** P94. True from a `submitMoves` call until it settles; P95 D10: and while one is held. */
  submitPending(): boolean;
  refreshLibrary(): Promise<void>;
  /**
   * Peek the held invite token (unauthenticated GET) and GET `/my-games` when
   * signed in. Not a game-state poll (P26).
   */
  refreshLobby(): Promise<void>;
  openMyGame(groupHash: GroupHash, gameNumber: GameNumber): Promise<void>;
  signOut(): void;
  deliverGoogleCredential(idToken: string): Promise<void>;
  receiveStateChanged(payload: StateChangedPayload): Promise<void>;
  becomeVisible(): Promise<void>;
  /**
   * P95 D11. Reopen a closed socket; then, in a game with no submit in flight or
   * held, read the version and take the wake path when it is newer.
   */
  poll(): Promise<void>;
  /** P95 D11. Send `{"action":"ping"}` on an open socket. */
  heartbeat(): void;

  /**
   * P49. The version whose state this client is now showing — reported after
   * every snapshot install and after every replay batch finishes.
   */
  noteDisplayed(version: number): void;
  /** Queued replay batches, in arrival order; none is ever dropped (P49). */
  pendingReplays(): readonly ReplayBatch[];
  /** Dequeue the oldest queued batch, or `undefined` when the queue is empty. */
  takeReplay(): ReplayBatch | undefined;

  onlineModeOffered(): boolean;
  seatKindOptions(): readonly PlannedSeatKind[];
  /** Kind control for one chair. Seat 0, online, does not offer `agent`. */
  seatKindOptionsFor(seatIndex: number): readonly PlannedSeatKind[];
  createOffered(): boolean;
  localMatchStarted(): boolean;
  copiedInviteUrl(): string | undefined;
  board(): OnlineGameBoard | undefined;
  lobbyFull(): boolean;
  inviteGoneReason(): 'revoked' | 'started' | undefined;
  inviteSeats(): readonly InviteSeat[] | undefined;
  inviteToken(): InviteToken | undefined;
  myGames(): MyGamesBody | undefined;
  /** `/me` hash after boot, when known (P26 Accept / roster). */
  userHash(): UserHash | undefined;
}
