@Flex
Feature: Get Notifications

  Scenario Outline: Failed get notifications request
    Given a correctly configured FLEX client
    And a notification exists
    But <Condition>
    When I attempt to get notifications
    Then it should fail with <ExpectedError>

    @CIOnly
    Examples: Infrastructure test
      | Condition                  | ExpectedError           |
      | the connection is insecure | a connection error      |

    Examples: Authentication + Data Validation
      | Condition              | ExpectedError           |
      | my API key is invalid  | an authentication error |
      | my push ID is missing  | a validation error      |

  Scenario: No notifications found for user
    Given a correctly configured FLEX client
    But the notification does not exist
    When I attempt to get notifications
    Then it should succeed

  Scenario: Successfully gets notifications in order
    Given a correctly configured FLEX client
    And multiple notifications exist
    When I attempt to get notifications
    Then it should succeed
