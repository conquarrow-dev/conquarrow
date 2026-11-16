# language: en
# Overview: docs/spec/online-reliability/online-reliability.md
# Packet P95 — server edge cases

Feature: The server's reliability edges

  Background:
    Given a started online game in group G, game 1, with Alice and Bob as human seats

  Scenario: A submit id from another user is not a duplicate
    Given Alice's step with submit id "s-1" has been answered with version 1
    When Bob posts with submit id "s-1" and If-Match version 0
    Then the answer is 412

  Scenario: A malformed submit id is unprocessable
    When Alice posts a step with a submit id of 65 characters
    Then the answer is 422 and nothing is written

  Scenario: A duplicate after the game moved on still answers its own version
    Given Alice's End turn with submit id "s-1" has been answered with version 1
    And Bob's End turn with no submit id has been answered with version 2
    When Alice posts the same End turn with submit id "s-1"
    Then the answer is 200 with version 1 and duplicate true
    And the stored version is still 2

  Scenario: A submit id that is not a string is unprocessable
    When Alice posts End turn with the submit id 7
    Then the answer is 422 and nothing is written

  Scenario: A human seat that is another human's is refused without the agent-seat reason
    When Bob posts End turn on Alice's turn
    Then the answer is 403 and its reason is not "agent-seat"

  Scenario: A lost race won by the same submit is a duplicate
    Given two copies of Alice's step with submit id "s-1" read version 0 together
    When both are posted
    Then one answers 200 with version 1
    And the other answers 200 with version 1 and duplicate true

  Scenario: The advance stops at its budget and the next read continues it
    Given four heuristic seats follow Alice and the clock passes the budget after two of their moves
    When Alice ends her turn
    Then the answer persists only what fit in the budget
    And the next read persists the rest as the following version

  Scenario: The advance budget is spent exactly at its edge
    Given a heuristic seat follows Alice and each heuristic move advances the clock by the whole budget
    When Alice posts End turn
    Then the stored move list holds Alice's move and one heuristic move

  Scenario: A read that needs no advance writes nothing
    Given it is Alice's turn and she has steps
    When Alice reads the game and the version
    Then the stored version is unchanged and nothing is woken

  Scenario: The version read refuses a non-member
    When Carol, who is not seated, reads the version
    Then the answer is 403

  Scenario: The heartbeat route answers
    When a connected socket sends a message on the default route
    Then the WebSocket handler answers 200

  Scenario: Payload sizes are logged
    When Alice reads the game
    Then one log line names the route, the status and the byte length of the body
    And no line carries a group hash
