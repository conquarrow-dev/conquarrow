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

The game is a hobby project in development and the MCP door has no clients
to keep working, so the result shape is changed freely and no compatibility
paths are kept. Review of PR #113 shaped decisions 1-3, 7, 9, 10, 12 and
13-20.

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
   three thirds (decision 18) followed by its force, written from the
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
    and error results are one JSON block. The web BYOK seat gets the same
    context (decisions 13 and 14).

The map layout is specified in [the spec](../../spec/agent-board-map/agent-board-map.md#the-map).

13. **One shared agent context, for MCP and BYOK.** `agentContext(offer,
    geometry, state, seat, board)` in `@conquarrow/byok-offer` returns the
    offer, and the board and the map that `board` asks for, from
    `boardView` and `boardMap`. The door turns it into result blocks. The
    web BYOK seat turns it into its user message with `agentPromptText`:
    the map section first, then the offer, so the reply instruction stays
    the last thing the model reads. Neither path builds a board or a map
    on its own, so they cannot drift.
14. **BYOK gets the map once per seat-turn: on the first request.** That is
    the MCP guidance (`"ascii"` at the start of the turn, `"off"` for the
    rest) applied to the BYOK loop. A later request in the same seat-turn
    sends the offer only; the plan echo it already carries is the model's
    memory of the turn, as the conversation is for an MCP agent. Cost: one
    map (about 4 KB on a mid-game board) per seat-turn, not per request.
    BYOK sends the map, not the board JSON: the offer's `STATE_JSON` and
    rows already carry the ids a reply needs, the board JSON costs about
    9 KB more, and the picture is what helped in the smoke test.
15. **One legend text.** `MAP_LEGEND` in `@conquarrow/byok-offer` is the map
    legend. `boardMap` prints it under its header, the MCP `board`
    description quotes it, and the BYOK system prompt quotes it. The map's
    column width, which depends on the board, is on the map's header line.
16. **The map is honest: nothing on the board is lost.** `parseBoardMap(text)`
    in `@conquarrow/byok-offer` reads a map back to its board, from the
    stated layout alone. For every representable board,
    `parseBoardMap(boardMap(board))` equals the board normalized (lists
    sorted, one key per seat). A board the map cannot draw exactly is
    refused with a `ContractViolation` (decision 20), never drawn lossy.
    A fast-check property test proves the round trip on random boards of
    the generated tiling; fast-check is a new devDependency of
    `byok-offer` only (the repo had none). The golden map reads back to
    the golden board.
17. **The grid shows each arrow's top layer, and says who owns a stack.**
    An arrow's slot is its stack as seat letter and exact heads (`B3`,
    `C12`), else its trail (`B`), else its territory (`b`), else `.`. Whose
    stack it is matters most at a glance (friend or foe), so the owner is
    in the grid; the count is exact, no `+`. Slots are `S` characters, the
    longest glyph on the board, with a space between slots, so a 12-head
    stack widens the cells instead of hiding its count. Considered and not
    chosen: two characters per layer in every slot (always wide, harder to
    read), and a digit-only stack with the owner in a footer (the agent
    would have to look the owner up for every stack).
18. **A spawner label names its holders.** Its three thirds, a lower-case
    holder letter per third held (seats in letter order) and `o` per
    unclaimed third, then the force: `ooo5` open, `bbo2/7` two thirds B and
    one open. It replaces `o` / `*` / `#`, which hid who holds what. A game
    has at most 8 seats, `A`-`H`, so `o` never names a seat.
19. **What the grid cannot show goes on lines after it, keyed by arrow
    id.** `stack <seat><heads> <arrow> spent <n> speed <n>` (plus `
    override <n>`) for every stack, and `under <arrow> <layers>` for every
    arrow whose glyph hides a trail or territory (bottom first: lower-case
    territory, then upper-case trails). The arrow id is the one moves use.
    `stacks: none` and `under: none` when empty. The header names the seats
    and both widths: `map me=B active=B players=A,B,C; 11 characters per
    column, 2 per arrow.`
20. **What the map refuses.** A non-canonical or foreign id; a seat, owner
    or holder that is not one letter `A`-`H`; an arrow in two territories,
    twice in one list, or under two stacks; a vertex twice; a spawner whose
    held counts are not positive or do not make 3 with `unclaimed`; a force
    that is not `n/d`. Each throws a `ContractViolation` naming it. A real
    game position never has any of these.

## Scenarios

- `observe` with `board: "json"` on the agent's turn: the same offer, plus a
  board with every territory arrow, trail arrow, stack and spawner.
- `observe` with `board: "ascii"`: the same JSON as `"off"`, plus a second
  text block that is `boardMap` of that board.
- `observe` with `board: "both"`: the board and the map block.
- `observe` without `board`, or with `"off"`: the JSON block and the offer block.
- `board` with any other value: a correctable error, nothing read or written.
- A stop result, with any valid `board`: no board, no map.
- `move` with `board` that leaves steps: the new offer with the board and
  map of the new position. A `move` that ends the turn: stop, no board.
- Every result with an offer: JSON block without `offer`, then the offer as
  its own text block.
- The web BYOK seat's first request of a seat-turn: the map section, from
  the same `agentContext` the door uses, then the offer. Later requests in
  that seat-turn: the offer only. The system prompt has the map legend.
- Spawners of any force (`1/5`, `2/7`, `1/16`) draw and widen from the data.
- Any representable board reads back from its map with `parseBoardMap`
  (property test); stacks show owner and exact heads; spawners show their
  holders; hidden trails and territory are on `under` lines.
- `tools/list` documents `board` on `observe` and `move`: the enum, the
  default, the cost, when to use it, the legend.
- `boardMap` draws territory, trails, stacks and spawners with their force,
  with axes and a legend, and is the same text for the same board in any
  list order.
- `pnpm board-map` prints the map from a saved `observe` result or a board.
- The smoke-test game, rebuilt as a replay fixture, renders a golden map.

## Backlog

- **The legend is sent twice to a BYOK model** (system prompt and map
  header), about 1 KB twice now that the legend explains the under and
  stack lines. A token-saving candidate, with the bigger honest map
  (decisions 16-19): for example the legend in the system prompt only, or
  a shorter legend. Left for the human to weigh; not done here.

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
- The web BYOK seat's first request of each turn carries the same map an
  MCP agent gets with `board: "ascii"`, built by the same code.
- `parseBoardMap(boardMap(board))` equals the board normalized for every
  board the property test generates, and for the golden fixture.
- `pnpm verify` green. Incremental Stryker on `mcp-door.ts` and `board.ts`,
  survivors triaged.

## Review notes (2026-11-15)

- Mutation testing, incremental, on the changed lines of `mcp-door.ts` and
  `board.ts`. The door's result shape (`offerResult`, `toolResult`, the
  `board` check) has no survivors. The only survivors in the mutated ranges
  are on P92 lines this packet does not change (`id ?? null`, the `move`
  stop guards and burst condition), which the narrowed test set used for
  this run does not exercise.
- `board.ts` survivors are equivalent: the sort in `arrowGlyphs` only
  orders writes that cannot collide on a valid board; `?? []` is unreachable.

## Review notes, round 4 (2026-11-15)

- Mutation testing on the changed lines of `agent-context.ts`, `board.ts`
  (`MAP_LEGEND`, header), `mcp-door.ts` (`boardOption`, `offerResult`) and
  `byokBot.ts` (system-prompt note, first-request choice): 51 killed. The
  one survivor on the new door code (`context.board === undefined`) was
  equivalent, since JSON drops an undefined key; the spread was removed so
  the door passes `board: context.board` directly. The two other survivors
  are on lines this round does not change (`id ?? null` in `tools/list`,
  the BYOK fetch-failure branch), outside the narrowed test set.
- No web BYOK test assumed the user message starts with the offer; the
  token-budget tests still pass with the map on the first request (about
  4 KB more on that request only).
