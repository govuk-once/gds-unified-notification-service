@Flex
Feature: Delete Notification

  Scenario Outline: Failed notification deletions
    Given a correctly configured FLEX client
    But <Condition>
    When I attempt to delete a notification
    Then it should fail with <ExpectedError>

    @CIOnly
    Examples: Infrastructure
      | Condition                           | ExpectedError           |
      | the connection is insecure          | a connection error      |

    Examples: Authentication
      | Condition                           | ExpectedError           |
      | my API key is invalid               | an authentication error |

    Examples: Data Validation
      | Condition                           | ExpectedError           |
      | my push ID is missing               | a validation error      |

    Examples: Resource Not Found or Unauthorised Ownership
      | Condition                           | ExpectedError           |
      | the notification does not exist     | a not found error       |
      | the push ID belongs to another user | a not found error       |
