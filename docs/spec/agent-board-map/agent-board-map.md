# agent-board-map — the whole board for the agent seat

**Packet:** [P93 — The agent can see the whole board](../../design/packets/P93-agent-board-map.md)
**Builds on:** [remote-agent-mcp](../remote-agent-mcp/remote-agent-mcp.md) (P92), [ADR 0009](../../adr/0009-remote-agent-mcp-seat.md).
**SPEC:** none. No game rule. Nothing is owed to SPEC §11.
**Features:** [core](./agent-board-map.core.feature) · [edge cases](./agent-board-map.edge-cases.feature) · [message flows](./SCENARIOS.md)

The P92 offer is built to be small. Territory is a count, spawners are capped
at 12 rows, trails are a 24-arrow sample. In the 2026-11-14 smoke test that
left the agent unable to see borders or the open spawners in the centre. This
feature adds an opt-in `board` argument to `observe` and `move` that returns
the whole board as JSON, as a text map drawn by the door, or both. The map is
a pure renderer in the shared offer package, also behind `pnpm board-map`.

## Terms

| Term | Means |
|---|---|
| **`board` argument** | the optional `board` argument of `observe` and `move`: `"off"` (default), `"json"`, `"ascii"`, or `"both"` |
| **board** | the `board` object `"json"` and `"both"` add beside `offer`. Ids, not counts. Defined below |
| **map** | the text `boardMap(board)` returns, and the second content block `"ascii"` and `"both"` add. Defined below |
| **board-bearing result** | a tool result that carries an `offer`: `observe` on this seat's turn, or a `move` with `stop: false` |
| **cell width** | the characters per map column, `W`. Odd, at least 3 |
| **point cell** | the `W` characters of the map that draw one point's three out-arrows, centred |
| **vertex cell** | the `W` characters of the map between point cells, where spawners are drawn |
| **spawner label** | a spawner's held glyph followed by its force, such as `o9` or `#12` |
| **`pnpm board-map`** | the CLI. Reads a board, or an observe result carrying one, from a file argument or stdin. Prints the map |

## Where the code lives (BSSN)

- **`@conquarrow/byok-offer`** (`src/board.ts`): `boardView(geometry, state, me)`,
  `boardMap(board)`, `parseBoardView(json)`. Pure: no clock, no I/O. The
  group rows and spawner rows are the same helpers `snapshotForPrompt` uses,
  so a `board.groups` row and a `STATE_JSON.groups` row cannot drift apart.
- **MCP door** (`packages/online-api/src/mcp-door.ts`): `observe` and `move`
  read `board`, add the `board` key and the map block to a board-bearing
  result, and document `board` in `tools/list`. Nothing else in the door
  changes.
- **CLI**: `scripts/board-map.mjs` (vite-node launcher, same shape as
  `pnpm bots`) and `scripts/board-map-run.ts` (read input, parse, print).
  No logic beyond I/O.

## The board

```json
{
  "me": "B",
  "players": ["A", "B", "C"],
  "activePlayer": "B",
  "territory": { "A": ["tiling:a:…"], "B": [], "C": ["…"] },
  "trails": { "A": [], "B": [], "C": ["…"] },
  "groups": [{ "arrow": "…", "owner": "C", "heads": 2, "spent": 0, "speed": 2 }],
  "spawners": [{ "vertex": "tiling:v:…", "force": "1/9", "held": { "B": 3 }, "unclaimed": 0 }]
}
```

- `territory` and `trails` have one key per seat in `players` order, each a
  list of arrow ids sorted ascending. A seat with none has `[]`. An owner
  that is not in `players` follows the seats, in id order, so no arrow is
  dropped.
- `groups` is every stack, in the `STATE_JSON.groups` row shape, sorted by
  arrow id (`speedOverride` only when set).
- `spawners` is every spawner on the board, sorted by vertex id. `held` maps
  a seat to how many of the 3 bordering arrows it holds as territory;
  `unclaimed` is the rest. Same row shape as `STATE_JSON.spawners`.
- `offer` beside it is the same text the call returns with `board: "off"`.
  The board is of the same position as that offer.

## The `board` argument

| `board` | Content blocks of a board-bearing result |
|---|---|
| missing or `"off"` | 1: the P92 JSON, byte for byte |
| `"json"` | 1: the P92 JSON plus a `board` key |
| `"ascii"` | 2: the P92 JSON; then the map as plain text, real newlines |
| `"both"` | 2: the P92 JSON plus a `board` key; then the map |

- The JSON block is always first and parses alone. The map block is never
  inside JSON: an escaped string does not read as a grid.
- A stop result and an error result are unchanged by `board`: one block, no
  board, no map.
- Any other value (a string not in the four, a boolean, a number, `null`)
  is `isError` with `{ error, stop: false }`, `error` naming the four values.
  It is checked before the invite is read: nothing is read, applied or
  written.
- `full` is not an argument. A client that sends it gets the `"off"` result
  (unknown arguments are ignored, as in P92).

## Tool descriptions

`tools/list` is the agent's only manual. On both `observe` and `move` the
`board` property is `{ type: "string", enum: ["off", "json", "ascii",
"both"], default: "off" }` and not required. Its description, the same on
both tools, says:

- what each value returns, and that the map comes as a second text block;
- the cost: on the smoke-test position the offer is about 6 KB, the map
  about 4 KB, the board JSON about 9 KB, and `"both"` is the sum;
- when to use it: `"ascii"` once at the start of a turn to see borders,
  fronts and far spawners; `"json"` when exact ids are needed beyond the
  offer; `"off"` for the rest of the turn;
- the map legend, in one line.

The `observe` and `move` tool descriptions name `board` and point at that
property. `move`'s says the board is of the position after the move.

## The map

```mermaid
flowchart LR
  B[board] --> P[place each arrow at its origin point#59; direction from origin to target]
  B --> V[place each spawner at its vertex position]
  P --> G[grid of cells]
  V --> G
  G --> T[header + legend + rows + stacks line]
```

Positions come from the generated tiling's layout (`makeLayout()`), the one
the browser draws:

- A point at layout position `(x, y)` sits at **row** `round(-2y)` and
  **column** `round(x / (√3/2))`. For tiling point `(i, j)` that is row
  `2i + j`, column `j`. Up on the screen is a larger row. Rows print top
  (largest) to bottom.
- Each column is `W` characters wide. `W` is 3, or `2L + 1` when the
  longest spawner label is `L` characters and that is more than 3 (`5` for
  `o9`, `7` for `#12`). A cell whose row and column have the same
  parity is a **point cell**; the other cells are **vertex cells**.
- A point cell draws that point's three out-arrows in its middle 3
  characters, with `(W - 3) / 2` spaces each side, ordered by where the
  arrow points on screen: **left** = down-left, **middle** = up, **right** =
  down-right. On the tiling those are `tiling:a:i,j,2`, `…,0`, `…,1`.
- An arrow's glyph: a stack's head count `1`–`9`, or `+` for 10 or more;
  else the trail owner's seat letter in upper case; else the territory
  owner's seat letter in lower case; else `.`. A stack wins over a trail, a
  trail over territory.
- A spawner sits in the vertex cell at its layout position, rounded the same
  way. Its label goes in the **left** `L` characters, left-aligned, when its
  position is left of the column centre, and in the **right** `L`
  characters, right-aligned, when right; `L = (W - 1) / 2`. The label is the
  held glyph then the force. Held glyph: `o` open (no share held), `*` part
  held (1 or 2 shares held), `#` all held (3 shares held, by one seat or
  several). Force: `d` for a `1/d` force (`3`, `9`, `12`), else the force as
  written (`2/9`). A vertex cell with no spawner is spaces.
- The grid covers the smallest row and column range holding every listed
  arrow's origin point and every spawner. Point cells with no listed arrow
  print `...`.
- Output lines, in order: a header naming `me` and `activePlayer`; four
  legend lines (rows and columns with `W`; the point-cell slots; the arrow
  glyphs; the spawner label); a column-label line; one line per row (`row` right-aligned
  in 3, a space, then the cells); then `stacks:` listing each stack as
  `<owner><heads> <arrow id>`, sorted by owner then arrow, joined by `; ` (`stacks: none` when there is none). Trailing spaces are
  trimmed. Lines end with `\n`.

A sample, from the smoke-test fixture, is the golden file
[`smoke-2026-11-14.map.txt`](../../../packages/byok-offer/test/fixtures/smoke-2026-11-14.map.txt).
Its board is [`smoke-2026-11-14.board.json`](../../../packages/byok-offer/test/fixtures/smoke-2026-11-14.board.json),
so `pnpm board-map packages/byok-offer/test/fixtures/smoke-2026-11-14.board.json`
prints it without a server.

## Decisions (BSSN)

Recorded in the [packet](../../design/packets/P93-agent-board-map.md#decisions-bssn-settled-with-the-human-2026-11-14):
one `board` enum on `observe` and `move`; any other value is a correctable
error; a board only beside an offer; no summary lines; the door draws the map
too, as its own content block; spawner force on the map; the tool
descriptions teach `board`; tiling only. Two more made here:

- **`parseBoardView` is strict on shape.** It accepts a board, or an object
  with a `board` key holding one. It returns `undefined` for anything
  missing `me`, `players`, `territory`, `trails`, `groups` or `spawners`, or
  whose lists are not lists. The CLI prints a one-line error and exits 1.
- **The fixture is rebuilt, not copied.** The browser's export of the
  2026-11-14 game omits the heuristic seat's moves and the agent's
  `endTurn`s (backlog item). The fixture re-runs seat A with the production
  chooser, inserts the missing `endTurn`s, checks every move legal, and ends
  with B to move. It is a real, reachable position close to the human's
  screenshots, not a byte copy of the online log.

## Invariants

1. When a board-bearing result has `board` `"json"` or `"both"`, the system shall list every territory arrow of the position exactly once, under its owner.
2. When a board-bearing result has `board` `"json"` or `"both"`, the system shall list every trail arrow of every seat, with no sample cap.
3. When a board-bearing result has `board` `"json"` or `"both"`, the system shall list every spawner, and for each one the held shares plus `unclaimed` shall equal 3.
4. When `board` is missing or `"off"`, the system shall return exactly the P92 result, one content block, with no `board` key.
5. When a board-bearing result has `board` `"ascii"` or `"both"`, the system shall return a second text content block equal to `boardMap` of that position's board.
6. If `board` is not one of the four values, then the system shall return a correctable error and shall not read, apply or write anything.
7. The system shall render the same map for the same board, whatever the order of its lists.
8. The system shall draw every listed arrow in its origin point's cell, at the slot its direction names, with the glyph its precedence names.
9. The system shall draw every spawner exactly once, as its held glyph and force, in one side of one vertex cell.

## Counts

- Core scenarios: 9. Edge-case scenarios: 18 (four outlines). Invariants: 9.
- Flows in [SCENARIOS.md](./SCENARIOS.md): 2 (observe with board, move with board).
