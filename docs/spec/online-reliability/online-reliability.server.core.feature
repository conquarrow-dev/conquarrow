# language: en
# Overview: docs/spec/online-reliability/online-reliability.md
# Packet P95 — server (packages/online-api)

Feature: The server is the source of truth
  As a seated player whose phone loses requests, tokens and sockets
  I want the server to answer every retry, play every forced turn and say who won
  So that no game waits on something nobody will do

  Background:
    Given a started online game in group G, game 1

  Rule: A submit is applied at most once (D1)

    Scenario: A repeated submit answers its version and applies nothing
      Given Alice and Bob are the human seats and it is Alice's turn at version 0
      And Alice's step with submit id "s-1" has been answered with version 1
      When Alice posts the same step with submit id "s-1" and If-Match version 0
      Then the answer is 200 with version 1 and duplicate true
      And the stored version is 1
      And the log holds Alice's step once

  Rule: The server plays every pass and every heuristic turn (D2)

    Scenario: A lost seat is passed by the server
      Given Alice, Bob and Carol are the human seats
      And Bob's seat is lost, so its only legal move is the pass
      When Alice ends her turn
      Then the server also plays Bob's pass in the same version
      And it is Carol's turn

    Scenario: A pass-only agent seat is passed on the next read
      Given Alice is the human seat and the agent seat is active with no legal step
      When Alice reads the game
      Then the agent seat's pass is persisted as the next version
      And it is no longer the agent seat's turn

  Rule: The browser door moves only a human seat (D3)

    Scenario: A human POST on the agent seat's turn is refused
      Given Alice owns the agent seat and it is the agent seat's turn
      When Alice posts a move from her browser
      Then the answer is 403 with reason "agent-seat"
      And nothing is written

  Rule: A finished game says how it ended (D4)

    Scenario: A finished game's GET carries the summary
      Given the game has a winner
      When Alice reads the game
      Then the body carries a summary naming the winner, the turn count and every seat's standing

    Scenario: Observe on a finished game carries the summary
      Given the game has a winner and Alice's agent is seated
      When the agent observes
      Then the answer stops with reason "game-over" and the summary

  Rule: A cheap version read (D5)

    Scenario: The version read answers the version and the active seat
      Given it is Alice's turn at version 0
      When Alice reads the version
      Then the answer is 200 with version 0 and Alice's seat as the active player
      And the body carries no state

  Rule: Every device wakes (D6)

    Scenario: The caller's other connection is woken
      Given Alice is connected from two devices and Bob from one
      When Alice ends her turn from one device
      Then both of Alice's connections and Bob's connection receive the wake
