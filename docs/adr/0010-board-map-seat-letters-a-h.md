# ADR 0010 — The agent board map writes seats as letters A–H

**Status:** Accepted
**Date:** 2026-11-15
**Context:** [P93](../design/packets/P93-agent-board-map.md), [`SPEC.md`](../../SPEC.md) §8

## Context

The ASCII board map (`boardMap` / `parseBoardMap` in `@conquarrow/byok-offer`)
is lossless: a property test reads every map back to the same board. To stay
reversible in one character per seat it uses uppercase A–H for stacks and
trails, lowercase a–h for territory, and `o` for an unclaimed spawner third.
`o` must never be a seat letter, so the seat alphabet stops at H.

## Decision

Seats in the map are the single letters A–H. `boardMap` throws a
`ContractViolation` for any other seat rather than drawing an ambiguous map.

This caps an agent-visible game at 8 seats. The engine already takes 2–8
seats, and the lobby offers only 3-way and 6-way games, so the cap costs
nothing today.

## Consequences

If a game with more than 8 seats is ever wanted, the map needs a new
open-third marker (or multi-character seats) before it can draw it. The
property tests and the golden fixture will catch a change that breaks the
round trip.
