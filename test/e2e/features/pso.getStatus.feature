@Pso
Feature: Get PSO Status

  Scenario Outline: Failed PSO status retrieval
    Given a correctly configured PSO client
    But <Condition>
    When I attempt to get the PSO status
    Then it should fail with <ExpectedError>

    Examples: Infrastructure test
      | Condition                        | ExpectedError         |
      | the connection is insecure       | a transport error     |
      | my MTLS certificate is missing   | a transport error     |

    Examples: Authentication
      | Condition                       | ExpectedError          |
      | my API key is invalid           | an unauthorised error  |

  Scenario: Successfully get PSO status
    Given a correctly configured PSO client
    When I attempt to get the PSO status
    Then it should succeed
