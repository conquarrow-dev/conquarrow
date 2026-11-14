# language: en
# Overview: docs/spec/agent-board-map/agent-board-map.md
# Packet P93. Where the full board and the map stop.

Feature: Full board and map boundaries
  As an agent asking for the whole board
  I want stops to stay stops, a wrong flag to cost nothing, and the map to be exact at its edges
  So that the full board never changes the P92 protocol or misdraws a position

  Background:
    Given the MCP door signs tokens with an injected signer and an injected clock
    And S3 is a fake store

  Rule: Only a stop-free observe with full true carries a board

    Scenario Outline: full true on a stop result carries no board
      Given <situation>
      When C calls observe with the invite handle and full true
      Then the tool text has stop true and reason "<reason>"
      And it has no board key and no offer

      Examples:
        | situation                                         | reason        |
        | an invite C has joined that is not started        | not-started   |
        | a started game whose active seat is A's human seat | not-your-turn |

    Scenario Outline: full that is not the boolean true is the compact result
      Given a started game whose active seat is C's agent seat
      When C calls observe with the invite handle and full <value>
      Then the tool text is exactly the compact result for that state
      And it has no board key

      Examples:
        | value  |
        | false  |
        | "true" |
        | 1      |

  Rule: The board is whole where the offer is capped

    Scenario: A trail longer than the sample is listed whole
      Given a started game where seat A has a trail of more than 24 arrows and C's agent seat is to move
      When C calls observe with full true
      Then board.trails lists every arrow of A's trail
      And the offer's STATE_JSON still samples that trail

    Scenario: A seat with no territory or trail still has its keys
      Given a board for a position where seat A holds no territory and no trail
      Then board.territory has key A with an empty list
      And board.trails has key A with an empty list

  Rule: Glyph precedence and limits

    Scenario: A stack on a trail arrow shows the head count, a trail on territory shows the trail
      Given a board where tiling:a:0,0,0 is A's territory and B's trail and holds B's stack of 3
      And tiling:a:0,0,1 is A's territory and B's trail
      When boardMap draws it
      Then the up character of point (0,0) is "3"
      And the down-right character of point (0,0) is "B"

    Scenario: A stack of 10 or more heads shows "+"
      Given a board with a stack of 12 heads on tiling:a:0,0,0
      When boardMap draws it
      Then the up character of point (0,0) is "+"
      And the stacks line lists that stack with 12

    Scenario: A spawner whose shares are split between seats is all held
      Given a board with a spawner whose held is A 2 and C 1 and unclaimed 0
      When boardMap draws it
      Then that spawner's character is "#"

    Scenario: A part-held spawner is "*"
      Given a board with a spawner whose held is B 1 and unclaimed 2
      When boardMap draws it
      Then that spawner's character is "*"

  Rule: What the map refuses

    Scenario: An arrow id from a fixture board is refused
      Given a board whose territory lists an arrow id from the minimal fixture board
      When boardMap draws it
      Then it throws a ContractViolation naming that id

    Scenario Outline: parseBoardView refuses what is not a board
      When parseBoardView reads <input>
      Then it returns undefined

      Examples:
        | input                                   |
        | a stop result with no board             |
        | a board with territory as a number      |
        | a board missing spawners                |
        | null                                    |

    Scenario: pnpm board-map on input that is not a board exits 1
      When the text "{}" is piped to pnpm board-map
      Then stderr names the problem
      And the exit code is 1
