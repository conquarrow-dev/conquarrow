# language: en
# Overview: docs/spec/online-turn-flow/online-turn-flow.md
# Packet P94, builds on P49

Feature: The client's own move plays out like a wake
  As a human seated in an online game with heuristic seats
  I want my move and every seat after it to play out on my board
  So that no seat's turn jumps to its end state

  Background:
    Given an online game route for group G, game 1
    And A is signed in and seated, and it is A's turn
    And A's client is showing version 4

  Rule: A submit replays from the displayed baseline

    Scenario: End turn replays A's move and the burst
      Given the server answers A's End turn with version 5
      And the snapshot is at version 5
      And the log from version 4 to 5 holds A's End turn and the heuristic seats' moves
      When A submits End turn
      Then the outcome is "sent"
      And the client GETs the log since version 4
      And one replay batch from 4 to 5 holding all of those moves is queued

    Scenario: A route of several steps is one submit and one replay window
      Given the server answers A's three steps with versions 5, 6 and 7
      And the snapshot is at version 7
      And the log from version 4 to 7 holds the three steps
      When A submits the three steps
      Then the steps are POSTed in order with If-Match 4, 5 and 6
      And one replay batch from 4 to 7 is queued

  Rule: A submit is visibly in flight

    Scenario: A submit is pending until it settles
      Given the server has not answered A's End turn yet
      When A submits End turn
      Then the submit is pending
      When the server answers with version 5
      Then the submit is no longer pending

    Scenario: A second submit while one is in flight is refused
      Given the server has not answered A's End turn yet
      And A has submitted End turn
      When A submits End turn again
      Then the second outcome is "refused"
      And only one POST was sent

    Scenario Outline: Turn controls lock while sending or replaying
      Given submitting is <submitting> and a replay playing is <replaying>
      Then the turn controls are <locked>

      Examples:
        | submitting | replaying | locked   |
        | false      | false     | unlocked |
        | true       | false     | locked   |
        | false      | true      | locked   |
        | true       | true      | locked   |

    Scenario: End turn shows that it is sending
      Given a submit is in flight
      Then End turn reads "Sending…"
      And with no submit in flight End turn reads "End turn"
