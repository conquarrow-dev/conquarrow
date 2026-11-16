# language: en
# Overview: docs/spec/online-reliability/online-reliability.md
# Packet P95 — web (packages/web)

Feature: The client is acknowledged, or catches up
  As a human on a phone
  I want every tap answered and every other seat's move to reach me
  So that I never stare at a board the server has already left

  Background:
    Given an online game route for group G, game 1
    And A is signed in and seated, and it is A's turn
    And A's client is showing version 4

  Rule: A submit is retried with its own id (D9)

    Scenario: Every POST carries a submit id
      When A submits two steps
      Then each POST body carries a different submit id

    Scenario: A gateway timeout is retried with the same id and lands
      Given the first POST is answered 503 and the second 200 with version 5
      When A submits End turn
      Then the outcome is "sent"
      And both POSTs carry the same submit id and If-Match version 4

  Rule: A 401 holds the submit (D10)

    Scenario: The submit is sent after the next sign-in
      Given the POST is answered 401
      When A submits End turn
      Then the outcome is "unauthorized"
      And the submit is still pending
      When a new credential arrives
      Then the End turn is posted again with the same submit id
      And the submit is no longer pending

  Rule: Never miss a wake (D11)

    Scenario: The poll reopens a closed socket
      Given A's socket has closed
      When the poll runs
      Then a new socket is opened

    Scenario: A newer version from the poll takes the wake path
      Given the version read answers version 6
      When the poll runs
      Then the client reads the snapshot and the log since version 4
      And a replay batch from 4 to 6 is queued

  Rule: Resume catches up (D12)

    Scenario: Coming back reopens the socket and re-reads the game
      Given A's socket has closed while the page was hidden
      When the page becomes visible
      Then a new socket is opened
      And the game is read again
