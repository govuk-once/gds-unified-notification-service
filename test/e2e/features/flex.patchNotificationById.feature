@Flex
Feature: Patch Notification by ID

  Scenario Outline: Failed patch notification request
    Given a correctly configured FLEX client
    And a notification exists
    But <Condition>
    When I attempt to patch the notification
    Then it should fail with <ExpectedError>

    @CIOnly
    Examples: Infrastructure test
      | Condition                           | ExpectedError           |
      | the connection is insecure          | a connection error      |

    Examples: Authentication + Data Validation
      | Condition                           | ExpectedError           |
      | my API key is invalid               | an authentication error |
      | my push ID is missing               | a validation error      |

    Examples: Authorisation (notification owner mismatch)
      | Condition                           | ExpectedError           |
      | the push ID belongs to another user | a not found error       |

  Scenario: Notification not found
    Given a correctly configured FLEX client
    But the notification does not exist
    When I attempt to patch the notification
    Then it should fail with a not found error

  Scenario: Fails when request body is missing
    Given a correctly configured FLEX client
    And a notification exists
    When I attempt to patch the notification without a body
    Then it should fail with a validation error

  Scenario: Successfully patches notification status
    Given a correctly configured FLEX client
    And a notification exists
    When I attempt to patch the notification
    Then it should succeed
