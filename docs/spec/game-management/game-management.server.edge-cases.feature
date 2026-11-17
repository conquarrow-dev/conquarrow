# language: en
# Overview: docs/spec/game-management/game-management.md
# Packet P96 — server edge cases (packages/online-api)

Feature: Edges of the export and game management
  As the server that owns every game
  I want every refusal to be exact and every write to be scoped
  So that nothing but the asked-for change ever happens

  Scenario: The export refuses no sign-in, a non-member and an unknown game
    Given a started game of Alice and Bob
    Then the export without a bearer answers 401
    And the export for Carol answers 403
    And the export of an unknown game answers 404

  Scenario: A reply record written before P96 has no seat and is withheld mid-game
    Given a started game whose log holds an agentReply with no seat
    When Bob, who owns the agent seat, gets the export
    Then the record is withheld and counted

  Scenario: The caller's own agent replies are exported mid-game
    Given a started game where Bob's agent has replied once
    When Bob gets the export
    Then the log holds that agentReply and withheldReplies is 0

  Scenario: A game whose meta predates the owner field reads its owner from the invite
    Given a started game whose meta has no ownerUserHash and whose invite Alice created
    When Alice posts delete with the exact confirm
    Then the answer is 200

  Scenario: A game with no owner on record cannot be deleted
    Given a started game whose meta has no ownerUserHash and no invite record
    When Alice posts delete with the exact confirm
    Then the answer is 403

  Scenario: A repeated delete answers 404
    Given a game Alice has deleted
    When Alice posts delete again
    Then the answer is 404

  Scenario: A group pointer goes only when the group has no game left
    Given Alice and Bob have games 1 and 2 in one group
    When Alice deletes game 1
    Then Alice's and Bob's group pointers remain
    When Alice deletes game 2
    Then Alice's and Bob's group pointers are gone

  Scenario: Delete removes every member's hidden pointer for the game
    Given Bob has hidden a won game that Alice owns
    When Alice deletes it
    Then Bob's hidden pointer for it is gone

  Scenario: A rename by a non-owner is refused
    Given a started game of Alice and Bob that Alice owns
    When Bob posts the name "Mine"
    Then the answer is 403

  Scenario: An empty name clears the name
    Given a started game named "Old"
    When the owner posts the name ""
    Then the answer is 200 with no name
    And GET of the game has no name

  Scenario Outline: A malformed listing query is refused
    When Alice gets her games with <query>
    Then the answer is 422

    Examples:
      | query                   |
      | section=everything      |
      | section=finished&offset=-1 |
      | section=finished&limit=0   |
      | section=finished&limit=51  |
      | section=finished&offset=x  |

  Scenario: Unhide puts the game back
    Given Bob has hidden a won game
    When Bob posts hide false
    Then Bob's games hold the row again and counts hidden 0
    And section hidden lists nothing

  Scenario: A hide body without a boolean is refused
    Given a won game of Alice and Bob
    When Bob posts hide with body {"hidden": "yes"}
    Then the answer is 422

  Scenario: Rows of meta from before P96 sort by start time and show no turn
    Given two games of Alice with startedAt and no lastActivityAt
    When Alice gets her games
    Then the newer start is listed first
    And neither row has turns
