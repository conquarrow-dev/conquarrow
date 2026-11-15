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

  Rule: board "json" adds the board and keeps the offer

    Scenario: observe with board "json" on the agent's turn returns the offer and the whole board
      Given a started game whose active seat is C's agent seat
      And the position has more than 12 spawners
      And an MCP access token for C
      When C calls observe with the invite handle and board "json"
      Then the result has one text content block
      And the tool text has stop false
      And the offer equals offerText of that state and C's seat
      And board.me is C's seat and board.activePlayer is the active seat
      And board.territory lists every territory arrow of the position under its owner
      And board.trails lists every trail arrow of every seat
      And board.groups lists every stack with the STATE_JSON group row
      And board.spawners lists every spawner of the position

    Scenario: observe without board is the compact P92 result
      Given a started game whose active seat is C's agent seat
      And an MCP access token for C
      When C calls observe with the invite handle and no board
      Then the result has one text content block
      And the tool text is exactly stop false and the offer
      And it has no board key

  Rule: board "ascii" adds the map as its own text block

    Scenario: observe with board "ascii" returns the compact JSON and then the map
      Given a started game whose active seat is C's agent seat
      And an MCP access token for C
      When C calls observe with the invite handle and board "ascii"
      Then the result has two text content blocks
      And the first is exactly the compact result, with no board key
      And the second is boardMap of boardView of that state for C's seat
      And the second has real line breaks and starts with "map me="

    Scenario: observe with board "both" returns the board and the map
      Given a started game whose active seat is C's agent seat
      And an MCP access token for C
      When C calls observe with the invite handle and board "both"
      Then the first block has stop false, the offer and the board
      And the second block is boardMap of that board

  Rule: move takes board too

    Scenario: move that leaves steps returns the new offer with the board and the map
      Given a started game whose active seat is C's agent seat
      And an MCP access token for C
      When C calls move with one legal step, endTurn false, and board "both"
      And a legal step remains after it
      Then the first block has applied true, stop false, the new offer and the board of the new position
      And the second block is boardMap of that board

  Rule: tools/list teaches board

    Scenario: tools/list documents board on observe and move
      Given an MCP access token for C
      When C calls tools/list
      Then the observe and move input schemas each have a string property board
      And its enum is "off", "json", "ascii", "both", its default is "off", and it is not required
      And its description names each value, the cost, when to use it, and the map legend
      And the observe and move descriptions name board

  Rule: boardMap draws the board as text

    Scenario: The map draws territory, trails, stacks and spawners on the tiling's layout
      Given a board on the generated tiling where
        | item      | at                                   | owner | detail               |
        | territory | tiling:a:0,0,0                       | a     |                      |
        | trail     | tiling:a:0,0,1                       | B     |                      |
        | stack     | tiling:a:0,0,2 of 2 heads            | B     |                      |
        | spawner   | tiling:v:0,0,up                      |       | force 1/9, none held |
        | spawner   | tiling:v:0,-1,down                   |       | force 1/3, 3 held by A |
      When boardMap draws it
      Then the cell width is 5
      And the row 0 line has the point cell for (0,0) reading " 2aB "
      And the row 1 line has the column 0 vertex cell reading "#3 o9"
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
