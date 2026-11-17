# P96 — Match export and game management

> **Kind:** online (contracts + online-api + web + infra). **Depends on:** P45
> (library), P46 (library identity), P49 (move log), P92 (agent door), P95
> (server truth). **SPEC coverage:** none; no game rule is read or changed.
> Leaving a game mid-play would be a rule and is not offered.
> **ADR:** [0012 — a game has an owner; delete is permanent, hide is per user](../../adr/0012-game-owner-delete-hide.md).
> **Spec:** [docs/spec/game-management](../../spec/game-management/game-management.md).

## Why

Playtest P95 (2026-11-16) and the R2 cluster of the issue review:

1. **Download log exported the browser, not the game.** At the end of P95 the
   online Download log held 3 moves, `startedAt` the time of the last refresh,
   and local fields that are wrong online (`vsBot: true`, `botMode`,
   `botSeat: "A"`). A Google re-login had emptied the session. The server's
   `log.jsonl` has every version, the heuristic seats' moves and the agent's
   reply records; members had no way to read it whole.
2. **My games only grows.** Every playtest and experiment stays forever, all in
   one list sorted by status and hash, with no name, no turn and no activity.
3. **No game can be removed or named.** Games are a hash and a number.

## What ships

Server (`packages/online-api`):

1. `GET /games/{g}/{n}/export` for members: the config the server opened the
   game with, the seats by kind, name and owner, every log line, every move,
   the summary; rival agent replies withheld until the game is won (D1, D2).
2. The agent door's `export` tool from the same builder; `name` in the JSON
   block of `observe` and `move`; agent reply records carry their seat (D2, D3).
3. Owners (D4). `POST …/delete` with the exact confirm (D5), `POST …/name`
   (D6), and `name` on `POST /invites`.
4. `POST …/hide` for finished games, per user (D9).
5. The meta stamps `lastActivityAt` and `turns` on every version (D7).
   `GET /my-games` lists by section and activity with counts, and pages one
   section with `?section&offset&limit` (D8).

Contracts: `normalizeGameName`, `GAME_NAME_MAX`, `DELETE_GAME_CONFIRM`, the
richer `StartedGameRow`, `GameExport`, `LibraryChangedPayload`, and the new
pages-port methods.

Web: Download log saves the export for an online game; the lobby's My games
has sections (Finished and Hidden collapsed), Show more, richer rows, Rename,
Delete with the confirm, Hide/Unhide; the invite form takes a name; the HUD
shows the name; a deleted game leaves the screen with a note (D11, D12).

Infra: four `MoveFunction` routes (export, delete, name, hide).

## Not in this packet

- Auto-archive of old finished games (D10): backlog.
- Leaving or resigning a game still being played: needs a SPEC rule.
- A game-over summary screen in the browser (R3).
- Renaming an invite before it starts: name it at creation, rename the game.

## Gate

`pnpm verify` green. Stryker on `online-api` and on the touched web modules,
survivors triaged.
