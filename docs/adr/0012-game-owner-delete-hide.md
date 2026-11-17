# ADR 0012 — A game has an owner; delete is permanent, hide is per user

**Status:** Accepted
**Date:** 2026-11-17
**Context:** [P96](../design/packets/P96-game-management.md), [ADR 0002](./0002-cheap-async-online.md), [ADR 0011](./0011-server-is-source-of-truth.md)

## Context

Until P96 a game had members and no owner. Nothing could remove a game, so a
playtest or a junk experiment stayed in every member's My games forever, and
the list grew with every game. Two needs pull apart: the person who set a game
up wants to get rid of it for everyone, and a member wants a finished game out
of their own way without deciding for anyone else.

## Decision

1. **The owner is the invite's creator.** Start copies `creatorUserHash` into
   the game meta as `ownerUserHash`; older metas read it from their invite.
   Only the owner may rename or delete. Ownership is not transferable.
2. **Delete is permanent and for everyone.** It removes the game's meta,
   state and log, marks the invite `deleted`, removes every pointer to the
   game, and sends every member a `libraryChanged` wake. There is no undo and
   no tombstone in the listing; the invite's `deleted` status is the only
   trace, so an old link says what happened. The request must carry the exact
   confirm phrase the lobby shows, so no stray call deletes a game.
3. **Hide is per user and only for finished games.** A hidden pointer under
   the user's own prefix takes the game out of that user's sections; it is
   reversible and touches no one else. A game still being played cannot be
   hidden, because its seat may be asked to move; leaving such a game is a
   game rule (SPEC.md has none), not a lobby feature.

## Consequences

- A member cannot stop the owner from deleting a game they played in. For a
  hobby game among friends that is the right trade; the export (P96 D1) is
  how a member keeps a record.
- The wake gains a second type. Clients that only know `stateChanged` ignore
  it (P25 host contract), so the change is additive on the socket.
- Deleting reads and writes O(members) pointers, and lists one group prefix
  to decide whether the group pointer goes. Cheap at this scale (ADR 0002).
