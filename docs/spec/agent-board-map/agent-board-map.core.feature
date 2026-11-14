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

  Rule: observe with full true adds the board and keeps the offer

    Scenario: full observe on the agent's turn returns the offer and the whole board
      Given a started game whose active seat is C's agent seat
      And the position has more than 12 spawners
      And an MCP access token for C
      When C calls observe with the invite handle and full true
      Then the tool text has stop false
      And the offer equals offerText of that state and C's seat
      And board.me is C's seat and board.activePlayer is the active seat
      And board.territory lists every territory arrow of the position under its owner
      And board.trails lists every trail arrow of every seat
      And board.groups lists every stack with the STATE_JSON group row
      And board.spawners lists every spawner of the position

    Scenario: observe without full is the compact P92 result
      Given a started game whose active seat is C's agent seat
      And an MCP access token for C
      When C calls observe with the invite handle and no full
      Then the tool text is exactly stop false and the offer
      And it has no board key

    Scenario: tools/list documents full on observe
      Given an MCP access token for C
      When C calls tools/list
      Then the observe tool's input schema has a boolean property full
      And full is not required

  Rule: boardMap draws the board as text

    Scenario: The map draws territory, trails, stacks and spawners on the tiling's layout
      Given a board on the generated tiling where
        | item      | at                                   | owner | detail       |
        | territory | tiling:a:0,0,0                       | a     |              |
        | trail     | tiling:a:0,0,1                       | B     |              |
        | stack     | tiling:a:0,0,2 of 2 heads            | B     |              |
        | spawner   | tiling:v:0,0,up                      |       | none held    |
        | spawner   | tiling:v:0,-1,down                   |       | 3 held by A  |
      When boardMap draws it
      Then the row 0 line has the point cell for (0,0) reading "2aB"
      And the row 1 line has the column 0 vertex cell reading "# o"
      And the output has the header, the legend, the column labels, and a stacks line "B2 tiling:a:0,0,2"

    Scenario: pnpm board-map prints the map of a saved observe result
      Given a saved full observe result for the smoke-test fixture
      When it is piped to pnpm board-map
      Then stdout is boardMap of that result's board
      And the exit code is 0

  Rule: The smoke-test game renders the golden map

    Scenario: The rebuilt smoke-test game replays and draws the golden map
      Given the smoke-test fixture's config and moves
      When they are replayed with every move required legal
      Then seat B is to move
      And boardMap of boardView for seat B equals the golden map file
