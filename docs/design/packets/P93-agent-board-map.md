# P93 — The agent can see the whole board

> **Status:** in review (PR #113), revised 2026-11-15. **Kind:** online adapter + a pure
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

## Decisions (BSSN, settled with the human 2026-11-14; revised in PR review 2026-11-15)

The first cut took `full: true` on `observe` and drew the map on the client
only. The human reviewed PR #113 and replaced that with decisions 1-3, 7, 9
and 10 below. `full` is gone; it was never deployed, so nothing depends on it.
A second review (2026-11-15) added decision 12 (the offer leaves the JSON) and
made decision 9 value-agnostic: the game is a hobby project in development, so
protocol improvements land now rather than in the backlog.

1. **One enum, `board`, on `observe` and `move`.** `board` is one of
   `"off"`, `"json"`, `"ascii"`, `"both"`. Missing is `"off"`. The name says
   what the value is: `"ascii"`, not `"map"`, because "map" is an overloaded
   word for a small model.
   - `"off"`: the JSON block and the offer block (decision 12), nothing more.
   - `"json"`: the JSON block gains a `board` object.
   - `"ascii"`: a map block follows the offer block. The JSON block has no
     `board` key.
   - `"both"`: the `board` key and the map block.
2. **Any other value is a correctable error.** `board: "map"`, `true`,
   `"ASCII"`: `isError`, `{ error, stop: false }`, the error naming the four
   values. Nothing is read or written first, so a bad `move` applies nothing.
   An agent that guesses wrong learns the right spelling at once instead of
   silently getting the compact result.
3. **A board rides only on an offer.** `observe` on this seat's turn, and a
   `move` result that carries an `offer` (`stop: false`: a legal prefix with
   steps left, or an empty reply). A stop result (before Start, not this
   seat's turn, game over, not seated, or a `move` that ends the turn) and an
   error result have no board and no map. The board is of the same position
   as the offer beside it.
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
7. **The door draws the map too.** `"ascii"` and `"both"` call the same
   `boardMap` on the server, so an agent without the repo sees the map.
   `pnpm board-map` stays for saved JSON and prints the same text.
8. **The map draws the generated tiling only.** A fixture-board id is
   refused with a `ContractViolation` naming it.
9. **The map shows each spawner's force, whatever it is.** A spawner is its
   held glyph (`o`, `*`, `#`) followed by its force, written from the
   fraction alone: `d` when the force is `1/d`, else `n/d`. Spawner forces
   and their spread are a balance setting that will change; nothing in the
   map, the board, the tests or the docs names or assumes a particular set of
   forces. Cell width comes from the longest label on the board; the legend
   states it. The board JSON keeps `force` as the `n/d` string of
   `STATE_JSON.spawners` (decision 4).
10. **The map is its own text content block, with real newlines.** Inside
    the JSON it would be one escaped string and would not read as a grid.
    The JSON block stays first and stays parseable on its own.
11. **The tool descriptions teach `board` and the blocks.** `tools/list` says, on both
    tools, what each value returns, what it costs next to the offer, when to
    ask for it, and the map legend. The agent should not need the repo.
12. **The offer is its own text content block too.** This revises P92's
    result shape for every result that carries an offer (`observe` on this
    seat's turn; `move` with `stop: false`, including the empty reply). The
    content is, in order: a small JSON block of machine fields, the offer
    as plain text with real newlines, then the map when `board` asks for it.
    The JSON block has no `offer` key. It has `blocks`, naming the text
    blocks that follow in order: `["offer"]` or `["offer", "map"]`. Stop
    and error results are one JSON block, as before. The web BYOK seat
    already sends the offer as the plain-text user message of its chat
    request; it does not change, and a test pins that it stays plain text.

The map layout is specified in [the spec](../../spec/agent-board-map/agent-board-map.md#the-map).

## Scenarios

- `observe` with `board: "json"` on the agent's turn: the same offer, plus a
  board with every territory arrow, trail arrow, stack and spawner.
- `observe` with `board: "ascii"`: the same JSON as `"off"`, plus a second
  text block that is `boardMap` of that board.
- `observe` with `board: "both"`: the board and the map block.
- `observe` without `board`, or with `"off"`: the P92 result, one block.
- `board` with any other value: a correctable error, nothing read or written.
- A stop result, with any valid `board`: no board, no map.
- `move` with `board` that leaves steps: the new offer with the board and
  map of the new position. A `move` that ends the turn: stop, no board.
- Every result with an offer: JSON block without `offer`, then the offer as
  its own text block.
- The web BYOK seat sends the offer as the plain-text user message.
- Spawners of any force (`1/5`, `2/7`, `1/16`) draw and widen from the data.
- `tools/list` documents `board` on `observe` and `move`: the enum, the
  default, the cost, when to use it, the legend.
- `boardMap` draws territory, trails, stacks and spawners with their force,
  with axes and a legend, and is the same text for the same board in any
  list order.
- `pnpm board-map` prints the map from a saved `observe` result or a board.
- The smoke-test game, rebuilt as a replay fixture, renders a golden map.

## Non-goals

- Summary lines of any kind (decision 5).
- An image, SVG, or the browser's SVG over the door.
- A board on a stop or error result, or outside the agent door.
- Drawing a fixture board.
- Changing the offer text, the spawner cap, or the trail sample in the
  default `STATE_JSON`.
- Deploying. The human deploys.

## Acceptance

- An agent that calls `observe` with `board: "json"` can list every territory
  arrow and every spawner of the position.
- An agent that calls `observe` with `board: "ascii"` reads a map, with
  spawner forces, whose shape matches the browser at that position.
- No result carries the offer inside JSON.
- `move` with `board` returns the board of the position after the move.
- Default `observe` and `move` output is unchanged.
- `pnpm verify` green. Incremental Stryker on `mcp-door.ts` and `board.ts`,
  survivors triaged.
