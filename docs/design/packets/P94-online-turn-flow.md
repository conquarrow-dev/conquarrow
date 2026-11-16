# P94 — Online turn flow: every seat plays out, and a tap answers at once

> **Kind:** web adapter. **Depends on:** P49 (move-log replay), P48 (the
> camera), P26 (online auto-pass). **SPEC coverage:** none. No game rule is
> added, read or changed. Nothing is owed to SPEC §11.

## Why

Playtest P93 (2026-11-15/16, six seats: A heuristic, B agent, C and D
heuristic, E the human, F heuristic):

1. **Seats F and A never animate.** The human's own `POST /moves` runs the
   heuristic burst on the server in the same request
   (`online-api/src/game-handlers.ts`, `handleMove` → `runBurst`), and the
   server wakes only the *other* humans. On 200 the client calls `getGame`
   and installs the snapshot (`web/src/online-pages.ts`, `submitMove`); App
   then pushes effects for the human's own moves only. So every seat the
   burst plays after the human (F and A) jumps to its end state. The agent's
   move pings the human, and that wake replays the log (P49), so B, C and D
   animate.
2. **End turn gives no feedback on a phone.** The End-turn POST also waits
   for the burst, which takes seconds. Nothing marks the tap as received
   (`turnControlsLocked` reads only match-over, bot-busy and AI chair), so
   the human taps again.

## What ships

1. **A submit replays, it does not install.** After the client's own POSTs,
   it re-reads the snapshot and takes the P49 wake path from its displayed
   baseline: queue the log window as a replay batch, or install the snapshot
   when the window has a gap or cannot be read. The client's own moves and
   every seat's burst then play through the same commit path as a wake —
   effects, camera and match log.
2. **One submit per commit.** `submitMoves(moves)` replaces `submitMove(move)`
   on both ports. A drafted route of several steps, or End turn, is one call:
   the moves are POSTed in order, each `If-Match` the version the previous
   POST reported, and the first refusal stops the rest. Without this the
   second step of a route would be refused by P49 D7, because the first
   step's replay is already queued.
3. **A submit is visibly in flight.** From the tap until the submit settles,
   the action buttons and board input are locked and End turn shows a
   spinner and "Sending…". While the resulting replay plays, the controls
   stay locked (P49 D7 already refuses input then). A second submit while one
   is in flight is refused without a POST.
4. **Every outcome unlocks.** A refused move (422), a stale version (409 or
   412), a server error, and a network failure all settle the submit. A
   failure the human can act on shows a one-line note.

Breaking: the port method is renamed and takes a list. There are no other
clients.

## Not in scope

- The server's burst stays synchronous inside the End-turn POST. Making it
  asynchronous is a separate packet (the 30 s API Gateway cap is noted in the
  backlog).
- Slower or clearer animation of conversions, battles and encirclements
  (next UX packet; it depends on this one so that every seat replays).
- The match export (the backlog's export item).

## Scenario inventory

Core: an End turn replays the client's move and the burst; a route of several
steps is one submit and one replay window; a submit is in flight until it
settles; a second submit in flight is refused; controls lock and End turn
shows the spinner while sending.

Edge: a refused move stops the rest and replays the prefix; a stale version
replays what others did; a network failure and a server error settle and
unlock; an unauthorised POST prompts and does not reconcile; a gap and a
failed log read install; no displayed baseline installs; an empty submit, a
finished game, another seat's turn and a replay in flight send nothing; a 200
without a version stops the rest.

Spec: [`docs/spec/online-turn-flow/`](../../spec/online-turn-flow/online-turn-flow.md).

## Kickbacks

- **Phase 3 → 2 (P25 tests).** D3 reconciles after a 422, so the four P25
  tests that counted exactly one `GET /games/{g}/{n}` after a 422
  (`online-shell.edge-cases`, `online-shell.invariants`, `online-web.edge-cases`,
  `online-web.invariants`) now count two; each still asserts the board is the
  last good GET. Spec D3 records that it supersedes P25 here.
- **Phase 3 → 2 (P94 invariants).** "None after a stop" queued two extra moves
  even when every answer was 200, where there is no stop and the extras are
  rightly POSTed. The extras are now queued only after a stopping answer.
- **Phase 3 → 1 (D5).** `illegal()` must survive the reconcile's own reads,
  or the 422 note would vanish the moment D3 reconciles. Recorded in D5.
