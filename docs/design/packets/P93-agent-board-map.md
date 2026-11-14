# P93 — The agent can see the whole board

> **Status:** ready for `/spec-to-ship`. **Kind:** online adapter + a pure
> text renderer. **Depends on:** P92 (the MCP door and the shared offer),
> P75 (the spawner-row cap), P03 (the layout), [ADR 0009](../../adr/0009-remote-agent-mcp-seat.md).
>
> **SPEC coverage:** none. No game rule is added or changed. Nothing is owed
> to SPEC §11.

## Why

Smoke test 2026-11-14: the human played seat C in the browser, the bot played
seat B through the P92 door, seat A was heuristic. The door worked. The agent
played blind:

- `STATE_JSON` gives territory as a count (`"B": 50`), not as arrows. The
  agent knew where every stack was and not where any border was.
- Spawners are capped at 12 of 58 (P75), mostly those near the agent. The
  open 1/9 spawners in the centre were not in the list.
- Trails are a 24-arrow sample.

So the agent walked away from the centre and left its land unguarded. The
human sent screenshots and the play improved at once. The human asked for a
text form of what the screenshot shows.

## Decisions (BSSN, settled with the human 2026-11-14)

1. **Opt-in, on `observe` only.** `observe` takes `full: true`. On the
   agent's turn the result gains a `board` object beside the unchanged
   `offer`. Without `full: true` the result is byte-for-byte what P92 returns.
   The default offer stays small; the agent pays for the board only when it
   asks. `move` does not take the flag: the agent calls `observe` again.
2. **Only literal `true` opts in.** Any other value of `full`, or none, is the
   compact result. No new error.
3. **No board when `stop: true`.** Before Start, not this seat's turn, game
   over, not seated: the stop result is unchanged. The board rides on the
   offer.
4. **The board is the whole position the screen shows, as ids.**
   `board` = `me`, `players`, `activePlayer`, `territory` (every territory
   arrow, by owner), `trails` (every trail arrow, by owner, untruncated),
   `groups` (every stack, same rows as `STATE_JSON.groups`), `spawners`
   (every spawner: `vertex`, `force`, `held`, `unclaimed`, same rows as
   `STATE_JSON.spawners`). Every seat has a `territory` and a `trails` key,
   empty when it holds none. Lists are sorted by id. Full ids, the same
   spelling the offer rows use.
5. **No summary lines.** No direction to a spawner, no enemy distance, no
   merge warning. The human dropped them: the board plus the map carry it.
6. **A pure text map in `@conquarrow/byok-offer`.** `boardMap(board)` draws
   the board with the generated tiling's own geometry and layout: point
   positions from `makeLayout().pointPosition`, spawner positions from
   `vertexPosition`, arrow direction from the `GeometryPort`'s `origin` and
   `target`. No second copy of the lattice maths. `parseBoardView(json)`
   reads a board, or an `observe` result that carries one.
7. **The map stays on the client.** The door returns JSON. The map is drawn
   by `pnpm board-map` (a thin CLI under `scripts/`) or by any client that
   imports `boardMap`. Serving the map from the door is an open question for
   the human, not this packet.
8. **The map draws the generated tiling only.** A fixture-board id is
   refused with a `ContractViolation` naming it.

The map layout is specified in [the spec](../../spec/agent-board-map/agent-board-map.md#the-map).

## Scenarios

- `observe` with `full: true` on the agent's turn: the same offer, plus a
  board with every territory arrow, trail arrow, stack and spawner.
- `observe` without `full`, or with `full` not `true`: no `board` key.
- `observe` with `full: true` when the result is a stop: no board.
- `tools/list` documents `full` on `observe`.
- `boardMap` draws territory, trails, stacks and spawners, with axes and a
  legend, and is the same text for the same board in any list order.
- `pnpm board-map` prints the map from a saved `observe` result or a board.
- The smoke-test game, rebuilt as a replay fixture, renders a golden map.

## Non-goals

- Summary lines of any kind (decision 5).
- An image, SVG, or the browser's SVG over the door.
- A board on `move`, on a stop result, or outside the agent door.
- Drawing a fixture board.
- Changing the offer text, the spawner cap, or the trail sample in the
  default `STATE_JSON`.
- Deploying. The human deploys.

## Acceptance

- An agent that calls `observe` with `full: true` can list every territory
  arrow and every spawner of the position.
- `pnpm board-map < observe.json` prints a map whose shape matches the
  browser at that position.
- Default `observe` output is unchanged.
- `pnpm verify` green. Incremental Stryker on `mcp-door.ts`, survivors
  triaged.
