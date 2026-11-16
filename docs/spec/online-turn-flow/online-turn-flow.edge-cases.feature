# language: en
# Overview: docs/spec/online-turn-flow/online-turn-flow.md
# Packet P94, builds on P49

Feature: Every outcome of a submit settles, unlocks and stays honest
  As a human on a phone with a slow connection
  I want every tap to end, whatever the server did
  So that the board never stays locked or shows a move that did not land

  Background:
    Given an online game route for group G, game 1
    And A is signed in and seated, and it is A's turn
    And A's client is showing version 4

  Rule: The first refusal stops the rest and the board still catches up

    Scenario: A refused move stops the rest and replays the prefix
      Given the server answers A's first step with version 5 and the second with 422
      And the snapshot is at version 5
      And the log from version 4 to 5 holds the first step
      When A submits two steps
      Then the outcome is "illegal"
      And the host reports the move illegal
      And exactly two POSTs were sent
      And one replay batch from 4 to 5 is queued

    Scenario Outline: A stale version replays what the others did
      Given the server answers A's End turn with <status>
      And the snapshot is at version 6
      And the log from version 4 to 6 holds B's moves
      When A submits End turn
      Then the outcome is "stale"
      And one replay batch from 4 to 6 is queued

      Examples:
        | status |
        | 409    |
        | 412    |

    Scenario: A 200 without a version stops the rest
      Given the server answers A's first step with 200 and no version
      And the snapshot is at version 5
      And the log from version 4 to 5 holds the first step
      When A submits two steps
      Then the outcome is "sent"
      And exactly one POST was sent
      And one replay batch from 4 to 5 is queued

  Rule: Failures settle and unlock

    Scenario: A server error settles as failed
      Given the server answers A's End turn with 500
      And the snapshot is still at version 4
      When A submits End turn
      Then the outcome is "failed"
      And the submit is no longer pending
      And no replay batch is queued

    Scenario: A network failure settles as failed and the board catches up if the move landed
      Given A's End turn request is rejected by the network
      And the snapshot is at version 5
      And the log from version 4 to 5 holds A's End turn
      When A submits End turn
      Then the outcome is "failed"
      And the submit is no longer pending
      And one replay batch from 4 to 5 is queued

    Scenario: A network failure during reconcile still settles
      Given A's End turn request is rejected by the network
      And the snapshot request is rejected by the network
      When A submits End turn
      Then the outcome is "failed"
      And the submit is no longer pending
      And the board is still at version 4

    Scenario: An unauthorised POST prompts and does not reconcile
      Given the server answers A's End turn with 401
      When A submits End turn
      Then the outcome is "unauthorized"
      And the sign-in prompt was shown
      And the snapshot was not re-read

    Scenario Outline: A note says what the human can act on
      Then the note for "<outcome>" is <note>

      Examples:
        | outcome      | note                                                                                      |
        | sent         | none                                                                                      |
        | refused      | none                                                                                      |
        | illegal      | none                                                                                      |
        | unauthorized | none                                                                                      |
        | stale        | "The game moved on before your move arrived. The board has caught up."                    |
        | failed       | "The server did not answer, so your last move may not have been sent. Try again."         |

  Rule: Reconcile falls back to the snapshot like a wake does

    Scenario: A gap installs the snapshot
      Given the server answers A's End turn with version 5
      And the snapshot is at version 5
      And the log from version 4 reports a gap
      When A submits End turn
      Then the board is at version 5
      And no replay batch is queued

    Scenario: A failed log read installs the snapshot
      Given the server answers A's End turn with version 5
      And the snapshot is at version 5
      And the log read fails
      When A submits End turn
      Then the board is at version 5
      And no replay batch is queued

    Scenario: No displayed baseline installs the snapshot
      Given A's client has reported no displayed version
      And the server answers A's End turn with version 1
      And the snapshot is at version 1
      When A submits End turn
      Then the board is at version 1
      And the log was not read

  Rule: Guards send nothing

    Scenario Outline: A submit that cannot be sent is refused without a request
      Given <condition>
      When A submits End turn
      Then the outcome is "refused"
      And no POST was sent

      Examples:
        | condition                         |
        | the move list is empty            |
        | the game is finished              |
        | it is another seat's turn         |
        | a replay batch is queued          |
