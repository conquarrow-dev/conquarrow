# language: en
# Overview: docs/spec/online-reliability/online-reliability.md
# Packet P95 — web edge cases

Feature: The client's reliability edges

  Background:
    Given an online game route for group G, game 1
    And A is signed in and seated, and it is A's turn
    And A's client is showing version 4

  Scenario: A refusal is not retried
    Given the POST is answered 409
    When A submits End turn
    Then exactly one POST is sent

  Scenario: Retries are bounded
    Given every POST is rejected by the network
    When A submits End turn
    Then exactly three POSTs are sent, all with one submit id
    And the outcome is "failed"

  Scenario: A 403 is reported as not your seat
    Given the POST is answered 403
    When A submits End turn
    Then the outcome is "forbidden"
    And the note says the seat is not A's to move

  Scenario: A held submit is dropped on sign-out
    Given A's End turn is held after a 401
    When A signs out
    Then the submit is no longer pending

  Scenario: The poll sends nothing while a submit is in flight
    Given A's End turn POST has not been answered
    When the poll runs
    Then no version read is sent

  Scenario: The poll at the displayed version does nothing more
    Given the version read answers version 4
    When the poll runs
    Then no snapshot or log is read

  Scenario: A token near expiry prompts once
    Given A's token expires in two minutes
    When the page becomes visible twice
    Then GIS is prompted once

  Scenario: The heartbeat pings an open socket
    When the heartbeat runs
    Then the socket is sent {"action":"ping"}

  Scenario: A wake during a submit is left to the reconcile
    Given A's End turn POST has not been answered
    When a wake for version 5 arrives
    Then no snapshot is read until the POST is answered
