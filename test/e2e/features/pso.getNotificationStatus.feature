@Pso
Feature: Get Notification Status

  Scenario Outline: Failed notification status retrieval
    Given a correctly configured PSO client
    And a notification exists
    But <Condition>
    When I attempt to get the status of a notification
    Then it should fail with <ExpectedError>

    Examples: Infrastructure test
      | Condition                       | ExpectedError         |
      | the connection is insecure      | a transport error     |
      | my MTLS certificate is missing  | a transport error     |

    Examples: Authentication + Data Validation
      | Condition                       | ExpectedError         |
      | my API key is invalid           | an unauthorised error |

  Scenario: Notification not found
    Given a correctly configured PSO client
    But the notification does not exist
    When I attempt to get the status of a notification
    Then it should fail with a not found error

  Scenario: Successfully get notification statuses
    Given a correctly configured PSO client
    And a notification exists
    When I attempt to get the status of a notification
    Then it should succeed with statuses "VALIDATED_API_CALL, PROCESSING, PROCESSED, DISPATCHING, DISPATCHED"
