# P95 — Online reliability: the server is the source of truth

> **Kind:** online (online-api + web adapter + infra). **Depends on:** P18
> (moves and wake), P26 (online auto-pass), P49 (move-log replay), P92 (agent
> door), P94 (turn flow). **SPEC coverage:** §9 is *read*, not changed: a lost
> seat "keeps its place in turn order and is offered only the pass; that pass
> is a move in the log". The server now plays that pass. No game rule is added
> or changed. Nothing is owed to SPEC §11.
> **ADR:** [0011 — the server is the source of truth](../../adr/0011-server-is-source-of-truth.md).

## Why

Playtest P95 (2026-11-16, six seats, Gilad's phone and laptop, the dev agent on
seat C). Games stalled, and every stall had the same shape: a client waited for
something the server never sent or never did.

1. **End turn clears with no ack, still your turn** (P95 recurring, a #114
   regression). A Google ID token lives one hour. A submit answered 401 ended as
   `unauthorized`, which unlocked the controls and showed nothing; the One Tap
   prompt is often suppressed on a phone. A 503 from API Gateway's 30 s cap,
   while the Lambda went on to persist the move, read as a plain failure, and a
   second tap was then refused as stale.
2. **Events stop arriving as the game grows** (P95 t42: C applied at about
   19:50, Gilad's screen still on C at 19:54). The wake payload never carried
   the state; it is `{type, version, groupHash, gameNumber}`, constant size. The
   real causes: API Gateway drops a WebSocket after 10 minutes idle and after
   2 hours; the client never reopened it and never polled. Longer turns mean
   longer idles, so it got "more frequent as the game grew". Also, a POST never
   woke the caller's *own* other device (phone and laptop share a user).
3. **Resume shows a stale board; re-auth loses everything.** The token lived in
   `sessionStorage`, which a phone drops with the tab; nothing refreshed it
   ahead of expiry; the socket was not reopened on resume.
4. **A lost seat stays active forever** (P95 t47, seat C). The engine resolves
   losses after every move (P37) and offers a lost seat only the pass (§9). But
   nobody played that pass: the server's burst played heuristic seats only, and
   the client auto-pass (P26) runs only for the caller's own turn. An agent or
   a human seat with nothing to do held the game.
5. **Seat ownership.** The agent seat binds with its owner's Google `sub`, so
   its owner's browser and the agent share a user hash. The browser door must
   only ever move a *human* seat, and the agent door only an *agent* seat.
6. **Game over says nothing.** `observe` returned `{reason:"game-over"}` with no
   winner or standings; the browser showed the winner and nothing else.

## What ships

Server (`packages/online-api`):

1. **Idempotent submit.** `POST /moves` takes `{move, submitId}`. The envelope
   remembers the last applied submit; a repeat of it answers 200 with the
   version it produced (`duplicate: true`) and applies nothing.
2. **The server plays the turns no client will (the advance).** After every
   applied move and on every read of a game, the server passes any seat whose
   only legal move is the pass, of any kind, and plays heuristic seats, until a
   seat with a step that a human or agent must choose, or a winner. Bounded by
   a wall-clock budget; what is left continues on the next read.
3. **Seat-kind ownership.** Browser door: the active seat must be a *human*
   seat bound to the caller (403 `agent-seat` otherwise). Agent door unchanged
   (agent seat bound to the caller).
4. **Game-over summary.** A finished game's `GET` carries `summary` (winner,
   turns, per-seat standings). `observe` and `move` on a finished game return it
   with `reason: "game-over"`.
5. **A cheap version read.** `GET /games/{g}/{n}/version` → `{version,
   activePlayer, winner?}`, member only, for the poll fallback.
6. **Every device wakes.** Every bound human's every connection is woken,
   the caller's included. The payload stays version-only.
7. **Heartbeat route.** The WebSocket API gets a `$default` route that answers
   200, so a client `ping` keeps the socket out of the idle timeout.
8. **Payload sizes are logged.** One line per HTTP response and per wake.

Web (`packages/web`):

9. **A submit is acknowledged or explained.** Every POST carries a fresh
   `submitId`; a rejected fetch or a 500/502/503/504 is retried with the same
   id; a 401 holds the unsent moves, asks for sign-in, and sends them when the
   credential arrives. Every outcome that leaves it still your turn shows a
   note; nothing unlocks silently.
10. **Never miss a wake.** The socket is reopened when it closes, pinged on a
    heartbeat, and a version poll runs as the fallback; a newer version takes
    the P49 wake path.
11. **Resume.** Visibility, focus, `online` and `pageshow` re-read the game,
    reopen a closed socket, and refresh a token that is near or past expiry
    through One Tap with `auto_select`. The token is cached in `localStorage`;
    it is a cache, and nothing authoritative lives only in browser storage.

Breaking: the POST body, the wake recipients, the storage of the token and the
socket port change. There are no other clients.

## Not in scope

- The server export of the full match log (Download log for online games) and
  the lobby's game management: R2.
- Seat names and kinds in the shell, greyed lost seats, "your agent", the
  thinking indicator, blocking board input on an agent seat in the UI: R3.
- Agent context v2 (seat kinds in the offer, the event log, a read-only
  observe off-turn): R5. P95 only adds the game-over summary to observe.
- Moving the heuristic burst out of the request (an async worker). The advance
  budget keeps a request under the gateway cap instead; see ADR 0011.

## Scenario inventory

Server core: a repeated submit answers its version and applies nothing; a
lost seat is passed by the server; a pass-only agent seat is passed; a human
POST on an agent seat is 403; a finished game's GET carries the summary;
observe on a finished game carries the summary; the version read; the caller's
other connection is woken.

Server edge: a submit id from another user is not a duplicate; a malformed
submit id is 422; a duplicate after the game moved on still answers its own
version; a lost race whose winner was the same submit is a duplicate; the
advance stops at the budget and the next read continues it; a read-time advance
persists, logs and wakes; the heartbeat route answers 200; payload sizes are
logged.

Web core: every POST carries a submit id; a 503 is retried with the same id and
lands; a 401 holds the submit and sends it after sign-in; a closed socket is
reopened by the poll; a newer version from the poll takes the wake path; resume
reopens the socket and re-reads the game.

Web edge: a 4xx is not retried; retries are bounded; a held submit is dropped
on sign-out; the poll sends nothing while a submit is in flight; a token near
expiry prompts once; the heartbeat pings an open socket; a wake during a submit
is left to the reconcile.

Spec: [`docs/spec/online-reliability/`](../../spec/online-reliability/online-reliability.md).

## Kickbacks

- **Phase 3 → 2 (P18 / P68 / P92 wake tests).** D6 wakes the caller's own
  connections. The tests that asserted the caller was *not* woken now assert
  it is: `moves-ws` core, edge cases and invariants;
  `online-edge-probes` core ("every connection of every bound human") and
  edge cases ("heuristic seats are never posted; the mover is", and the two
  `notifyHumans` ordering scenarios, which used to name a caller to skip);
  `remote-agent-mcp` edge cases ("a browser move wakes the caller as well").
  The P18, P68 and P92 spec text now points here.
- **Phase 3 → 2 (P92 "no legal step remains").** D2 runs the advance on the
  agent door's read, so a seat that *starts* its turn pass-only is passed by
  the server before the agent's `move` is read. The P92 scenario now expects
  `stop: true, reason: "not-your-turn"` and the next human active.
- **Phase 3 → 3 (P92 opening wake).** The first agent read that creates
  `state.json` must still wake the acting user (P92 EARS 13). `ensurePosition`
  takes an optional `also` user hash, passed by the agent door.
- **Phase 3 → 2 (entry characterisation `$default`).** The WebSocket entry test used `$default`
  as its "unknown route"; D8 makes it the heartbeat route, so the test uses
  `sendmessage`.
- **Phase 3 → 2 (P25 / P94 body and retries).** Every POST body now carries
  `submitId`, so the P25/P26 tests that compared the body to `{move}`
  (`online-web` core and replay, `online-shell` replay, `online-playtest-ux`)
  check `{move, submitId}`. The P94 invariants now expect a 500 or a rejected
  fetch to be tried `SUBMIT_ATTEMPTS` times with the same `If-Match`, and a
  401 to leave the submit pending (held). The P94 note table gains the
  `unauthorized` and `forbidden` notes.
- **Phase 3 → 1 (D10).** "Dropped by a reconcile that finds it is no longer
  the caller's turn" had no reconcile to hang on while a submit is held. The
  spec now says what the code does: sign-out and opening another game drop
  it; a resend into a game that moved on is answered stale like any stale
  submit.
