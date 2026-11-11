@Flex
Feature: Delete Notification

  Scenario Outline: Failed notification deletions
    Given my FLEX client is configured <Configuration>
    When I attempt to delete an <NotificationState> notification with a "<PushIdState>" push ID
    Then the DELETE request should fail with a <StatusCode>

    @CIOnly
    Examples: Infrastructure test 
      | Configuration           | NotificationState | PushIdState | StatusCode |
      | insecurely              | existing          | valid       | 500        |

    Examples: Authentication
      | Configuration           | NotificationState | PushIdState | StatusCode |
      | with an invalid api key | existing          | valid       | 403        |

    Examples: Data Validation
      | Configuration           | NotificationState | PushIdState | StatusCode |
      | correctly               | existing          | missing     | 400        |

    Examples: Resource Not Found or Unauthorized Ownership
      | Configuration           | NotificationState | PushIdState  | StatusCode |
      | correctly               | unknown           | valid        | 404        |
      | correctly               | existing          | wrong user's | 404        |
