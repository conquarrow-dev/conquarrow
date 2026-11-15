# language: en
# Overview: docs/spec/agent-board-map/agent-board-map.md
# Packet P93. The agent asks for the whole board and can draw it as text.

Feature: The agent seat can see the whole board
  As an agent playing a seat through the MCP door
  I want every territory arrow, trail arrow, stack and spawner on request, and a text map of them
  So that I can see borders and far spawners the way the browser shows them

  Background:
    Given the MCP door signs tokens with an injected signer and an injected clock
    And S3 is a fake store

  Rule: The offer is its own plain-text block

    Scenario: observe without board returns the JSON block and the offer block
      Given a started game whose active seat is C's agent seat
      And an MCP access token for C
      When C calls observe with the invite handle and no board
      Then the result has two text content blocks
      And the first is exactly the JSON stop false, blocks ["offer"]
      And the second is offerText of that state and C's seat, with real line breaks
      And no block has an offer key

    Scenario: move that leaves steps returns the machine fields and the new offer as text
      Given a started game whose active seat is C's agent seat
      And an MCP access token for C
      When C calls move with one legal step and endTurn false
      And a legal step remains after it
      Then the first block is exactly applied true, the new version, stop false, blocks ["offer"]
      And the second block is offerText of the new position and C's seat

    Scenario: The web BYOK seat sends the offer as plain text
      Given a 3-seat opening with a BYOK seat to move and a fake chat endpoint
      When the BYOK seat plays its turn
      Then the user message content of the chat request is the offer text the seat built
      And it has real line breaks and the reply instruction
      And the seat applies the reply the endpoint returns

  Rule: board "json" adds the board to the JSON block

    Scenario: observe with board "json" on the agent's turn returns the offer and the whole board
      Given a started game whose active seat is C's agent seat
      And the position has more than 12 spawners
      And an MCP access token for C
      When C calls observe with the invite handle and board "json"
      Then the result has two text content blocks
      And the first has stop false, blocks ["offer"] and board
      And the second is offerText of that state and C's seat
      And board.me is C's seat and board.activePlayer is the active seat
      And board.territory lists every territory arrow of the position under its owner
      And board.trails lists every trail arrow of every seat
      And board.groups lists every stack with the STATE_JSON group row
      And board.spawners lists every spawner of the position

  Rule: board "ascii" adds the map as its own text block

    Scenario: observe with board "ascii" returns the JSON block, the offer and then the map
      Given a started game whose active seat is C's agent seat
      And an MCP access token for C
      When C calls observe with the invite handle and board "ascii"
      Then the result has three text content blocks
      And the first is exactly stop false, blocks ["offer", "map"], with no board key
      And the second is the offer text
      And the third is boardMap of boardView of that state for C's seat
      And the third has real line breaks and starts with "map me="

    Scenario: observe with board "both" returns the board and the map
      Given a started game whose active seat is C's agent seat
      And an MCP access token for C
      When C calls observe with the invite handle and board "both"
      Then the first block has stop false, blocks ["offer", "map"] and the board
      And the second block is the offer text
      And the third block is boardMap of that board

  Rule: move takes board too

    Scenario: move with board "both" returns the new offer with the board and the map
      Given a started game whose active seat is C's agent seat
      And an MCP access token for C
      When C calls move with one legal step, endTurn false, and board "both"
      And a legal step remains after it
      Then the first block has applied true, stop false, blocks ["offer", "map"] and the board of the new position
      And the second block is the new offer text
      And the third block is boardMap of that board

  Rule: tools/list teaches board and the blocks

    Scenario: tools/list documents board on observe and move
      Given an MCP access token for C
      When C calls tools/list
      Then the observe and move input schemas each have a string property board
      And its enum is "off", "json", "ascii", "both", its default is "off", and it is not required
      And its description names each value, the cost, when to use it, and the map legend
      And the legend describes force from the fraction, naming no particular force
      And the observe and move descriptions name board and say the offer is a plain-text block

  Rule: boardMap draws the board as text

    Scenario: The map draws territory, trails, stacks and spawners on the tiling's layout
      Given a board on the generated tiling where
        | item      | at                                   | owner | detail               |
        | territory | tiling:a:0,0,0                       | a     |                      |
        | trail     | tiling:a:0,0,1                       | B     |                      |
        | stack     | tiling:a:0,0,2 of 2 heads            | B     |                      |
        | spawner   | tiling:v:0,0,up                      |       | force 1/5, none held |
        | spawner   | tiling:v:0,-1,down                   |       | force 1/7, 3 held by A |
      When boardMap draws it
      Then the cell width is 5
      And the row 0 line has the point cell for (0,0) reading " 2aB "
      And the row 1 line has the column 0 vertex cell reading "#7 o5"
      And the output has the header, the legend, the column labels, and a stacks line "B2 tiling:a:0,0,2"

    Scenario: pnpm board-map prints the map of a saved observe result
      Given a saved board "json" observe result for the smoke-test fixture
      When it is piped to pnpm board-map
      Then stdout is boardMap of that result's board
      And the exit code is 0

  Rule: The smoke-test game renders the golden map

    Scenario: The rebuilt smoke-test game replays and draws the golden map
      Given the smoke-test fixture's config and moves
      When they are replayed with every move required legal
      Then seat B is to move
      And boardMap of boardView for seat B equals the golden map file
      And boardView for seat B equals the golden board file
