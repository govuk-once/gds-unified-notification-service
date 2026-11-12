@Pso
Feature: Get Notification Status

  Scenario Outline: Failed notification status retrieval
    Given a correctly configured PSO client
    But <Condition>
    When I attempt to get the status of a notification
    Then it should fail with <ExpectedError>

    @CIOnly
    Examples: Infrastructure test
      | Condition                       | ExpectedError         |
      | the connection is insecure      | a transport error     |
      | my MTLS certificate is missing  | a transport error     |

    Examples: Authentication
      | Condition                       | ExpectedError         |
      | my API key is invalid           | an unauthorised error |

    Examples: Resource Not Found
      | Condition                       | ExpectedError         |
      | the notification does not exist | a not found error     |

  Scenario: Successfully get notification statuses
    Given a correctly configured PSO client
    When I attempt to get the status of a notification
    Then it should succeed
    And I expect response to contain "VALIDATED_API_CALL, PROCESSING, PROCESSED, DISPATCHING, DISPATCHED"
