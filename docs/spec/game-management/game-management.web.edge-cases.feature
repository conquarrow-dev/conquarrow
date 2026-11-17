# language: en
# Overview: docs/spec/game-management/game-management.md
# Packet P96 — web edge cases (packages/web)

Feature: Edges of the web library and export
  As the browser adapter
  I want every odd answer handled without a guess
  So that the lobby never shows a game that is gone

  Scenario: A 404 for the game on screen marks it deleted
    Given game 1 of group G is on screen
    When a read of the game answers 404
    Then the board is cleared and gameDeleted is true

  Scenario: The host forwards a libraryChanged message and drops a malformed one
    Given an online host
    When the socket delivers a libraryChanged message
    Then the adapter receives it
    When the socket delivers a libraryChanged message with no change
    Then the adapter receives nothing

  Scenario: An invalid invite name blocks create
    Given a signed-in online lobby with a creatable seat plan
    When the player sets a 49-character invite name
    Then create is not offered

  Scenario: Rows are grouped into sections with Finished and Hidden collapsed
    Given library rows of every section
    When the lobby groups them
    Then Your turn and Waiting are open, Finished and Hidden are collapsed
    And each section's count is the server's count

  Scenario: A row's lines name the turn, the activity and the winner
    Given a finished row won by "Bob" after 40 turns
    Then its turn line is "40 turns" and it says "Won by Bob"
    Given a playing row at 7 turns
    Then its turn line is "Turn 8"

  Scenario: A row without a name is shown by its number
    Given a row of game 000003 with no name
    Then its title is "Game 000003"
