@Pso
Feature: Get Notification Status

  Scenario Outline: Failed notification status retrieval
    Given my PSO client is configured <Configuration>
    When I attempt to get the status of an <NotificationState> notification
    Then the GET request should fail <ExpectedError>

    @CIOnly
    Examples: Infrastructure test
      | Configuration                  | NotificationState | ExpectedError           |
      | insecurely                     | existing          | with a transport error  |
      | with missing MTLS certificate  | existing          | with a transport error  |

    Examples: Authentication
      | Configuration                  | NotificationState | ExpectedError           |
      | with an invalid api key        | existing          | with a 401              |

    Examples: Resource Not Found
      | Configuration                  | NotificationState | ExpectedError           |
      | correctly                      | unknown           | with a 404              |

  Scenario: Successfully get notification statuses
    Given my PSO client is configured correctly
    When I attempt to get the status of an existing notification
    Then the GET request should succeed with a 200
    And I expect response to contain "VALIDATED_API_CALL, PROCESSING, PROCESSED, DISPATCHING, DISPATCHED"
