# game-management — sequence diagrams

Participants are the seams the tests probe: **App** (the port's caller),
**Pages** (`createOnlinePages`), **API** (`createOnlineApi`, or the injected
`fetch` in web tests), **Door** (`handleMcpHttp`), **Store** (the object store)
and **WS** (post to connection). [Overview](./game-management.md).

## 1. Download log in an online game

```mermaid
sequenceDiagram
  participant App
  participant Pages
  participant API
  participant Store
  App->>Pages: exportGame()
  Pages->>API: GET /games/g/n/export (Bearer)
  API->>Store: get meta, state (heal), log, profiles
  API-->>Pages: 200 {format, config, seats, moves, log, withheldReplies}
  Pages-->>App: body text
  Note over App: save conquarrow-n.json — nothing from browser storage
```

## 2. The agent exports over MCP

```mermaid
sequenceDiagram
  participant Agent
  participant Door
  participant Store
  Agent->>Door: tools/call export {handle}
  Door->>Store: get invite (started, seat bound to the agent's user)
  Door->>Store: get meta, state (heal), log, profiles
  Note over Door: same builder as the browser route #59; own seats = the user's seats
  Door-->>Agent: JSON block = the export
```

## 3. The owner deletes a game

```mermaid
sequenceDiagram
  participant App
  participant Pages
  participant API
  participant Store
  participant WS
  App->>Pages: deleteGame(g, n)
  Pages->>API: POST /games/g/n/delete {confirm "Yes, permanently delete this game"}
  API->>Store: get meta (owner, or the invite's creator)
  API->>Store: delete meta, state, log
  API->>Store: delete hidden and lobby pointers #59; invite status deleted
  API->>Store: delete group pointers of a group with no game left
  API->>WS: libraryChanged {g, n, change deleted} to every member's connection
  API-->>Pages: 200 {deleted true}
  Pages->>API: GET /my-games
```

## 4. Another member's screen learns the game is gone

```mermaid
sequenceDiagram
  participant WS
  participant Pages
  participant App
  WS->>Pages: libraryChanged {g, n, deleted}
  alt the game is on screen
    Note over Pages: board cleared, hash '', gameDeleted true
  else
    Pages->>Pages: GET /my-games
  end
  Pages-->>App: lobby says "That game was deleted."
```

## 5. Show more in a section

```mermaid
sequenceDiagram
  participant App
  participant Pages
  participant API
  App->>Pages: loadMoreGames(finished)
  Pages->>API: GET /my-games?section=finished&offset=10&limit=10
  API-->>Pages: 200 {section, offset 10, limit 10, total 12, games[2]}
  Note over Pages: append to library.games, keep counts
  Pages-->>App: 12 finished rows
```
