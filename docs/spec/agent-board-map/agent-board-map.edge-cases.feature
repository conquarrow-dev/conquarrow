# language: en
# Overview: docs/spec/agent-board-map/agent-board-map.md
# Packet P93. Where the full board and the map stop.

Feature: Full board and map boundaries
  As an agent asking for the whole board
  I want stops to stay stops, a wrong flag to cost nothing, and the map to be exact at its edges
  So that stops stay stops and the map never misdraws a position

  Background:
    Given the MCP door signs tokens with an injected signer and an injected clock
    And S3 is a fake store

  Rule: Only a board-bearing result carries a board or a map

    Scenario Outline: a valid board on a stop result carries no board and no map
      Given <situation>
      When C calls observe with the invite handle and board "both"
      Then the result has one text content block
      And the tool text has stop true and reason "<reason>"
      And it has no board key and no offer

      Examples:
        | situation                                         | reason        |
        | an invite C has joined that is not started        | not-started   |
        | a started game whose active seat is A's human seat | not-your-turn |

    Scenario: move that ends the turn carries no board and no map
      Given a started game whose active seat is C's agent seat
      When C calls move with one legal step, endTurn true, and board "both"
      Then the result has one text content block
      And the tool text has applied true and stop true
      And it has no board key and no offer

    Scenario: board "off" is the compact result
      Given a started game whose active seat is C's agent seat
      When C calls observe with the invite handle and board "off"
      Then the result is the JSON block stop false, blocks ["offer"], and the offer block

    Scenario: An empty reply returns the current offer as its own block
      Given a started game whose active seat is C's agent seat with a legal step
      When C calls move with no moves, endTurn false, and board "ascii"
      Then the first block is exactly stop false, blocks ["offer", "map"]
      And the second block is the current offer text and the third its map

    Scenario Outline: board that is not one of the four values is a correctable error
      Given a started game whose active seat is C's agent seat
      When C calls <tool> with the invite handle and board <value>
      Then the result is isError with stop false
      And the error names "off", "json", "ascii" and "both"
      And nothing is applied or written

      Examples:
        | tool    | value   |
        | observe | "map"   |
        | observe | "ASCII" |
        | observe | true    |
        | observe | null    |
        | move    | 1       |

    Scenario: An unknown tool with a valid board is still an unknown tool
      Given a started game whose active seat is C's agent seat
      When C calls a tool named "peek" with the invite handle and board "ascii"
      Then the result is isError with error "unknown tool" and stop false
      And nothing is applied or written

  Rule: The board is whole where the offer is capped

    Scenario: A trail longer than the sample is listed whole
      Given a started game where seat A has a trail of more than 24 arrows and C's agent seat is to move
      When C calls observe with board "json"
      Then board.trails lists every arrow of A's trail
      And the offer block's STATE_JSON still samples that trail

    Scenario: A seat with no territory or trail still has its keys
      Given a board for a position where seat A holds no territory and no trail
      Then board.territory has key A with an empty list
      And board.trails has key A with an empty list

    Scenario: An owner that is not in players is listed after the seats
      Given a position where seat Z, not in players, holds territory arrow t1 and trail arrow t2
      Then board.territory lists t1 under key Z, after every seat in players
      And board.trails lists t2 under key Z, after every seat in players

  Rule: Glyph precedence and limits

    Scenario: A stack shows its owner and heads, and an under line lists what it hides
      Given a board where tiling:a:0,0,0 is A's territory and B's trail and holds C's stack of 3
      And tiling:a:0,0,1 is A's territory and B's trail
      When boardMap draws it
      Then the up slot of point (0,0) is "C3"
      And the down-right slot of point (0,0) is "B"
      And the map has the lines "under tiling:a:0,0,0 aB" and "under tiling:a:0,0,1 a"

    Scenario: Two seats' trails on one arrow show the first seat and list the other
      Given a board where tiling:a:0,0,0 is on A's trail and on C's trail
      When boardMap draws it
      Then the up slot of point (0,0) is "A"
      And the map has the line "under tiling:a:0,0,0 C"

    Scenario: A stack line carries spent and a speed override
      Given a board with A's stack of 5 heads, spent 2, speed 3 and speedOverride 1
      When boardMap draws it
      Then the map has the line "stack A5 tiling:a:0,0,0 spent 2 speed 3 override 1"

    Scenario: A stack of 10 or more heads shows its exact count and widens the slots
      Given a board with A's stack of 10 heads on tiling:a:0,0,0 and B's stack of 9 heads on tiling:a:0,0,1
      When boardMap draws it
      Then the slot width is 3
      And the up slot of point (0,0) is "A10"
      And the down-right slot of point (0,0) is "B9"
      And there is a stack line for each, with 10 and 9 heads, spent and speed

    Scenario: A spawner whose thirds are split between seats names each holder
      Given a board with a 1/4 spawner whose held is A 2 and C 1 and unclaimed 0, and no stacks
      When boardMap draws it
      Then that spawner's label is "aac4"
      And the map has the line "stacks: none"

    Scenario: A part-held spawner shows its open thirds as "o"
      Given a board with a 1/6 spawner whose held is B 1 and unclaimed 2
      When boardMap draws it
      Then that spawner's label is "boo6"

    Scenario Outline: Any force draws from its fraction, and cells widen to the longest label
      Given a board with spawners of force <forces>
      When boardMap draws it
      Then each spawner's label is its thirds then d for 1/d, else n/d
      And the cell width is <width>
      And the map header says <width> characters per column

      Examples:
        | forces           | width |
        | none             | 5     |
        | 1/5              | 9     |
        | 1/5, 1/16        | 11    |
        | 2/7              | 13    |
        | 1/5, 2/7, 1/16   | 13    |
        | 11/100           | 19    |

  Rule: What the map refuses

    Scenario: An arrow id from a fixture board is refused
      Given a board whose territory lists an arrow id from the minimal fixture board
      When boardMap draws it
      Then it throws a ContractViolation naming that id

    Scenario Outline: A board the map cannot draw exactly is refused
      Given a board with <problem>
      When boardMap draws it
      Then it throws a ContractViolation

      Examples:
        | problem                                              |
        | a non-canonical arrow id tiling:a:01,0,0             |
        | a territory owner "Z"                                |
        | a seat "AB" in players                               |
        | an arrow in A's and B's territory                    |
        | an arrow twice in A's trail                          |
        | two stacks on one arrow                              |
        | one vertex twice in spawners                         |
        | a spawner whose held plus unclaimed is 2             |
        | a spawner holding 0 for a seat                       |
        | a spawner force "1/x"                                |
        | a non-canonical vertex id tiling:v:0,-0,up           |
        | a me "b" that is not a seat letter                   |
        | a stack owner "I"                                    |
        | a spawner holder "O"                                 |
        | a spawner whose held plus unclaimed is 4             |
        | a spawner with negative unclaimed                    |
        | a spawner force "5"                                  |

    Scenario Outline: parseBoardMap refuses text that is not a map
      When parseBoardMap reads <text>
      Then it throws a ContractViolation

      Examples:
        | text                                       |
        | "hello"                                    |
        | an empty string                            |
        | a header with no slot width                |
        | a grid slot holding "?"                    |

    Scenario: parseBoardView keeps a valid board
      Given a board with a stack that has a speedOverride
      Then parseBoardView of that board, and of an observe result carrying it, equals the board

    Scenario Outline: parseBoardView refuses what is not a board
      When parseBoardView reads <input>
      Then it returns undefined

      Examples:
        | input                                   |
        | a stop result with no board             |
        | a board with territory as a number      |
        | a board missing spawners                |
        | null                                    |
        | a board whose me is not text            |
        | players holding a number                |
        | a trail or territory list that is not a list of text |
        | a group row missing or mistyping arrow, owner, heads, spent or speed |
        | a spawner row missing or mistyping vertex, force, held or unclaimed  |

    Scenario: pnpm board-map on input that is not a board exits 1
      When the text "{}" is piped to pnpm board-map
      Then stderr names the problem
      And the exit code is 1
