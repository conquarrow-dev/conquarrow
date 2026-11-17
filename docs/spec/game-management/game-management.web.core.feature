# language: en
# Overview: docs/spec/game-management/game-management.md
# Packet P96 — web (packages/web)

Feature: The lobby and HUD use the server's export and the managed library
  As a player in the browser
  I want Download log, delete, rename, hide and the sections to work from the server
  So that what I see and keep does not depend on this browser's storage

  Scenario: Download log in an online game saves the server's export
    Given an online game on screen
    And the export route answers 200 with a body
    When the player asks for the export
    Then the adapter answers exactly that body
    And the request was GET of the game's export path with the bearer

  Scenario: A failed export answers nothing
    Given an online game on screen
    And the export route answers 500
    When the player asks for the export
    Then the adapter answers undefined

  Scenario: The invite name is sent on create
    Given a signed-in online lobby with a creatable seat plan
    When the player sets the invite name " Friday  rematch" and creates the invite
    Then the POST body carries name "Friday rematch"

  Scenario: Delete sends the exact confirm, then refreshes the library
    Given a signed-in lobby
    When the player deletes game 1 of group G
    Then the adapter posts delete with confirm "Yes, permanently delete this game"
    And then gets the library

  Scenario: A library wake that deletes the game on screen clears it
    Given game 1 of group G is on screen
    When a libraryChanged wake with change "deleted" for that game arrives
    Then the board is cleared and the hash is empty
    And gameDeleted is true

  Scenario: A rename wake reads the library and the game on screen again
    Given game 1 of group G is on screen
    When a libraryChanged wake with change "renamed" for that game arrives
    Then the adapter gets the game and the library
    And the board has the new name

  Scenario: Show more pages a section
    Given the library shows 10 finished rows of 12
    When the player asks for more finished games
    Then the adapter gets section finished from offset 10
    And the library holds all 12 finished rows

  Scenario: Hide and unhide refresh the library
    Given a signed-in lobby
    When the player hides game 1 of group G
    Then the adapter posts hide true and then gets the library
