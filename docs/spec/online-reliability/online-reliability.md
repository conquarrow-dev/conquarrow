# online-reliability — the server is the source of truth

**Packet:** [P95 — Online reliability](../../design/packets/P95-online-reliability.md)
**SPEC:** §9 is read, not changed ("a lost seat keeps its place in turn order and
is offered only the pass; that pass is a move in the log"). No game rule is added.
**Builds on:** [P18 online-moves-ws](../online-moves-ws/online-moves-ws.md),
[P49 online-move-log-replay](../online-move-log-replay/online-move-log-replay.md),
[P94 online-turn-flow](../online-turn-flow/online-turn-flow.md),
[P92 remote-agent-mcp](../remote-agent-mcp/remote-agent-mcp.md).
**ADR:** [0011 — the server is the source of truth](../../adr/0011-server-is-source-of-truth.md).
**Layer:** `packages/online-api` (handlers, notify, the advance, the summary, the
version route, the WS `$default` route, the payload log), `packages/contracts`
(the pages socket, submit outcome, pages deps), `packages/web` (`online-pages.ts`,
`online-host.ts`, `online-window.ts`, `online-runtime.ts`, `online-gis.ts`,
`online-submit.ts`), `infra/template.yaml` (two routes).
**Features:** [server core](./online-reliability.server.core.feature) ·
[server edge cases](./online-reliability.server.edge-cases.feature) ·
[web core](./online-reliability.web.core.feature) ·
[web edge cases](./online-reliability.web.edge-cases.feature) ·
[sequence diagrams](./SCENARIOS.md)

## Purpose

The P95 playtest stalled four ways, each a client waiting for something that
would never come: an End turn that unlocked without an answer, a wake that never
arrived, a resumed tab that showed an old board, and a lost seat that nobody
passed. This packet makes the server the one place that decides and the clients
able to always catch up with it.

## Terms

| Term | Means |
|---|---|
| **submit id** | a client-chosen id on one `POST /moves`, 1–64 of `[A-Za-z0-9_-]` |
| **last submit** | `{id, userHash, version}` the envelope keeps for the last applied POST |
| **duplicate** | a POST whose submit id and caller equal the envelope's last submit |
| **pass-only seat** | the active seat when `legalMoves` holds no `step` (lost, headless, or boxed in) |
| **advance** | the server playing every pass-only seat and every heuristic seat in turn order, until a seat with a step that a human or agent must choose, or a winner |
| **budget** | the advance's wall-clock limit per request, `ADVANCE_BUDGET_MS` |
| **heal** | an advance run on a *read* of the game, persisted as a new version |
| **summary** | `{winner, turns, standings}` of a finished game |
| **poll** | the client's `GET …/version` fallback while it is in a game |
| **held submit** | the moves a 401 stopped, kept to send after the next credential |

## Decisions (online/web BSSN, recorded here)

### D1 — idempotent submit

`POST /games/{g}/{n}/moves` takes `{"move": …, "submitId": "…"}`. `submitId` is
optional on the wire (absent → no idempotency, as before); present, it must be
1–64 characters of `[A-Za-z0-9_-]`, else 422.

The persisted envelope gains `lastSubmit: {id, userHash, version}`, written with
every applied POST that carried an id. Every other write (an advance, a heal, an
agent move) carries the current `lastSubmit` forward unchanged.

A POST from a member whose `submitId` equals `lastSubmit.id` **and** whose user
hash equals `lastSubmit.userHash` is a duplicate: 200
`{version: lastSubmit.version, groupHash, gameNumber, duplicate: true}`, nothing
applied, nothing woken. The duplicate check runs before `If-Match`, the finished
check and the turn check, so a retry after the game moved on still learns that
its move landed.

When the conditional write loses a race, the handler re-reads the envelope; if
its `lastSubmit` is this submit, the answer is the duplicate 200, else 412 as
before.

### D2 — the advance

`advance(game, seats, heuristic, clock)` loops while there is no winner:

1. the active seat's `legalMoves` holds no `step` → apply `endTurn` for it,
   **whatever its kind** (human, heuristic, agent). This is §9's pass, played by
   the server;
2. the active seat is heuristic → play its turn as the burst did (up to
   `MAX_MOVES_PER_TURN` choices, then a forced `endTurn`);
3. otherwise stop.

Before each move it reads the clock; once `ADVANCE_BUDGET_MS` (20 000 ms) has
passed since the advance began, it stops with what it has. A heuristic turn may
stop mid-turn; the position is a legal one and the next advance carries on.
`ADVANCE_MAX_MOVES` (4 096) bounds one call against a position that passes
forever. These are transport limits, not balance values.

The advance runs:

- after every applied browser POST and agent `move` (replacing `runBurst`),
- when the opening is materialised (replacing the opening burst),
- **on every read** — `GET /games/{g}/{n}`, `GET …/version`, `POST /moves`
  before its checks, and the agent door's `observe`/`move` load — as a heal.

A heal that plays at least one move persists `version + 1` (state, log lines
stamped with that version, library summary, `lastSubmit` carried forward) and
wakes every bound human (D6). A heal that loses the conditional write re-reads
the envelope and serves that. A read that needs no advance writes nothing.

The client auto-pass (P26) stays: the server has usually passed already, and a
client auto-pass on a seat that is no longer active is refused by its guards.

### D3 — seat-kind ownership

The browser door moves only a **human** seat bound to the caller. When the
active seat is an agent seat bound to the caller, the POST answers 403
`{error: "forbidden", reason: "agent-seat"}`; any other seat that is not the
caller's answers 403 `{error: "forbidden"}` as before. The agent door moves only
an agent seat bound to the caller (unchanged, P92).

### D4 — the game-over summary

For a game with a winner, `GET /games/{g}/{n}` adds

```json
"summary": {
  "winner": "<player id>",
  "turns": 123,
  "standings": [
    { "player": "<id>", "seat": 0, "kind": "human", "territory": 40, "shares": 6, "heads": 9, "lost": false }
  ]
}
```

`turns` is the number of `endTurn` moves in the log (stamped or not). `standings`
follow `state.players` order; `territory`, `shares`, `heads` and `lost` are read
with rules-core's `territoryCountOf`, `shareCountOf`, `headsOf` and `isLost` —
nothing is restated. `kind` is the invite seat's kind.

The agent door's `observe` and `move` on a finished game answer
`{stop: true, reason: "game-over", summary}`; a `move` whose own moves end the
game answers `{applied: true, version, stop: true, summary}`.

### D5 — the version read

`GET /games/{g}/{n}/version` → 200 `{version, activePlayer, winner?}`, member
only (P18 rules: 401, 403, 404), after the heal. It is the poll's endpoint: a
small answer whatever the board's size.

### D6 — every device wakes

Every wake goes to every connection of every bound human, **the caller's
included**: a user's phone and laptop are two connections of one user hash.
This supersedes P18's "not to the caller". The payload stays
`{type: "stateChanged", version, groupHash, gameNumber}` — version-stamped and
constant-size. A client already showing that version does nothing (P49 D4).

### D7 — payload sizes are logged

`OnlineApiDeps` gains an optional `log(line)`. Every HTTP response writes one
JSON line `{"http": "<METHOD> <route>", "status": s, "bytes": n}` (the route
name, never the path, so no hash is logged) and every wake post writes
`{"ws": "stateChanged", "bytes": n, "status": s}`. The HTTP Lambda wires
`console.log`.

### D8 — the heartbeat route

The WebSocket API gets a `$default` route on the connect Lambda; `$default`
answers 200 and does nothing else. A client sends `{"action":"ping"}`.

### D9 — the client submit (supersedes P94 D2's single attempt)

Every POST of a submit carries `submitId = deps.newId()` (browser:
`crypto.randomUUID()`). A rejected fetch or a 500, 502, 503 or 504 answer is
retried with the **same** body and `If-Match`, up to `SUBMIT_ATTEMPTS` (3)
attempts, waiting `deps.wait(SUBMIT_RETRY_MS × attempt)` (1 000 ms) between.
Any other answer is final. A duplicate 200 counts as a 200 with that version.
A submit whose attempts are spent ends `failed`, as before.

`deps.newId` and `deps.wait` are optional on `OnlinePagesDeps`; absent, the
adapter uses `crypto.randomUUID` and an immediate wait. The browser runtime
passes a real timer.

### D10 — a 401 holds the submit

A 401 on a submit's POST ends the submit `unauthorized`, keeps the unsent moves
(that one included, with its submit id) and the version to send them at as the
**held submit**, and asks GIS for a credential (`prompt`). While a submit is
held, `submitPending()` is true, so the controls stay locked.
`deliverGoogleCredential` sends the held submit (D9 rules, same submit ids) and
then reconciles (P94 D3). A held submit is dropped by sign-out and by opening
another game (or by a credential that arrives on another route). If the game
moved on meanwhile, the resend is answered 409/412 and ends `stale`, like any
stale submit, with its reconcile.

`submitNote`: `unauthorized` → "Your sign-in expired. Sign in again and your
move will be sent."; `forbidden` (a new outcome, 403) → "That seat is not yours
to move."; `failed` and `stale` as P94.

### D11 — never miss a wake

`OnlinePagesOpenSocket` becomes `(url, events: {onClose}) => socket`, and the
socket gains `send(text)`. When the current socket closes, the adapter forgets
it.

The host gains `handlePoll()` and `handleHeartbeat()`; the browser runtime calls
them every `POLL_MS` (15 000 ms) and `HEARTBEAT_MS` (300 000 ms, under API
Gateway's 10-minute idle) while the page is visible.

- **heartbeat**: an open socket is sent `{"action":"ping"}`.
- **poll**: when signed in and online-ready, reopen the socket if none is open;
  then, on a game route, unless a submit is in flight or held, GET `…/version`;
  a version above the replay baseline (P49) takes the wake path (`planWake`).

A wake that arrives while a submit is in flight is ignored: the submit's
reconcile reads the same server (P94 D3).

### D12 — resume and the token

The runtime binds `visibilitychange` (visible), `focus`, `online` and
`pageshow` to `handleVisibility(true)`. `becomeVisible` reopens a closed socket,
refreshes a stale token (below), re-reads the game (P25), and refreshes the
lobby.

The ID token is cached in `localStorage` under the same key. It is a cache: the
server verifies it on every request, and no board, log or seat is ever read from
browser storage for an online game. When the token's `exp` claim (read without
verification) is less than `REAUTH_LEAD_MS` (300 000 ms) away or past, by
`deps.now()`, the adapter calls `gis.prompt()` — once per token. GIS is
initialised with `auto_select: true`, so a returning user gets a new credential
with no tap. A token whose `exp` cannot be read is left to the server's 401.

## Flow

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Posting: submitMoves passes the guards
  Posting --> Posting: 200 or duplicate, more moves
  Posting --> Retrying: rejected fetch, 500, 502, 503, 504
  Retrying --> Posting: same submit id, attempts left
  Retrying --> Reconciling: attempts spent → failed
  Posting --> Held: 401
  Held --> Posting: credential delivered
  Held --> Idle: sign-out or another route
  Posting --> Reconciling: last 200, 403, 409, 412, 422
  Reconciling --> Idle: outcome returned
```

## Invariants (EARS)

1. *Ubiquitous*: The server shall apply a submit id from one user at most once per game.
2. *Event-driven*: When a POST repeats the last applied submit id of the same user, the server shall answer 200 with the version that submit produced and shall write nothing.
3. *Unwanted*: If the active seat has no legal step and there is no winner, then the server shall not leave the game waiting on that seat after any write or read it serves.
4. *Ubiquitous*: Every pass the server plays shall be the engine's `endTurn`, logged with the version that persisted it.
5. *Unwanted*: If the browser door is asked to move a seat that is not a human seat bound to the caller, then the server shall answer 403 and write nothing.
6. *State-driven*: While a game has a winner, its `GET` and the agent door's game-over answers shall carry the summary.
7. *Ubiquitous*: A wake shall carry only the type, version, group hash and game number, and shall reach every connection of every bound human.
8. *Ubiquitous*: One advance shall stop within its budget and its move cap.
9. *Unwanted*: If a submit's POST is not answered, then the client shall resend it with the same submit id before reporting failure.
10. *Unwanted*: If a submit is answered 401, then the client shall keep it pending until it is sent after a new credential or dropped by sign-out or a route change.
11. *State-driven*: While the client is in a game and visible, it shall reopen a closed socket and poll the version, and a newer version shall take the wake path.
12. *Ubiquitous*: The client shall read no online board, log or seat from browser storage.

## Counts

12 invariants · 4 feature files · 5 sequence diagrams.
