# agent-board-map — message flows

**Spec:** [overview](./agent-board-map.md) · [core](./agent-board-map.core.feature) · [edge cases](./agent-board-map.edge-cases.feature)

Two flows change: P92's `observe` and `move`
([remote-agent-mcp flows 9 and 10](../remote-agent-mcp/SCENARIOS.md#9-observe)).
`join`, OAuth and the ping are unchanged. The board and the map are built in
the handler from the `GameState` the door already holds: no extra read, no
extra write.

| Leaf the test may probe | Why this seam |
|---|---|
| `ObjectStore` | the door reads the invite and the position from it. `board` adds no read and no write |
| clock, signer | injected. Not I/O probes |

`boardView` and `boardMap` are pure. They are not leaves and are not probed.

## 1. observe with board

```mermaid
sequenceDiagram
  participant IDE
  participant Mcp as MCP door
  participant Offer as byok-offer
  participant S3
  IDE->>Mcp: tools/call observe with handle and board
  alt board is not off, json, ascii or both
    Mcp-->>IDE: isError, error naming the four values, stop false
    Note over Mcp,S3: nothing read or written
  else
    Mcp->>S3: read invite and position
    alt not started, not seated, not this seat's turn, or game over
      Mcp-->>IDE: one block, stop true and reason, no offer, no board
    else this seat's turn
      Mcp->>Offer: offerText, and boardView and boardMap as board asks
      alt board missing or off
        Mcp-->>IDE: one block, stop false and the offer
      else json
        Mcp-->>IDE: one block, stop false, the offer and the board
      else ascii
        Mcp-->>IDE: block 1 stop false and the offer, block 2 the map text
      else both
        Mcp-->>IDE: block 1 with the board, block 2 the map text
      end
    end
  end
```

## 2. move with board

```mermaid
sequenceDiagram
  participant IDE
  participant Mcp as MCP door
  participant S3
  IDE->>Mcp: tools/call move with handle, moves, endTurn and board
  alt board is not off, json, ascii or both
    Mcp-->>IDE: isError, error naming the four values, stop false
    Note over Mcp,S3: nothing applied or written
  else
    Mcp->>S3: P92 move: read, apply, conditional put
    alt result has stop false and an offer
      Mcp-->>IDE: the P92 JSON plus board and or the map block, of the position after the move
    else stop true, or an error
      Mcp-->>IDE: the P92 result, one block, no board
    end
  end
```

## Coverage

| Path | Test |
|---|---|
| 1 this turn, json | core: observe with board "json" |
| 1 this turn, missing | core: observe without board |
| 1 this turn, ascii | core: observe with board "ascii" |
| 1 this turn, both | core: observe with board "both" |
| 1 this turn, off | edge: board "off" is the compact result |
| 1 bad value | edge outline: board that is not one of the four values |
| 1 stop | edge outline: a valid board on a stop result |
| 2 steps left, both | core: move that leaves steps |
| 2 stop | edge: move that ends the turn |
| 2 bad value | edge outline: board that is not one of the four values (move) |
