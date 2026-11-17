@Flex
Feature: Delete Notification

  Scenario Outline: Failed notification deletions
    Given a correctly configured FLEX client
    And a notification exists
    But <Condition>
    When I attempt to delete a notification
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
    When I attempt to delete a notification
    Then it should fail with a not found error
