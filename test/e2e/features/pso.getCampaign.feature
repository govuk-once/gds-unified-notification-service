@Pso
Feature: Get Campaign Status

  Scenario Outline: Failed campaign status retrieval
    Given a correctly configured PSO client
    And a campaign exists
    But <Condition>
    When I attempt to get the campaign status
    Then it should fail with <ExpectedError>

    Examples: Infrastructure test
      | Condition                       | ExpectedError         |
      | the connection is insecure      | a transport error     |
      | my MTLS certificate is missing  | a transport error     |

    Examples: Authentication
      | Condition                       | ExpectedError         |
      | my API key is invalid           | an unauthorised error |

  Scenario: Campaign not found
    Given a correctly configured PSO client
    But the campaign does not exist
    When I attempt to get the campaign status
    Then it should fail with a not found error

  Scenario: Successfully get campaign status
    Given a correctly configured PSO client
    And a campaign exists
    When I attempt to get the campaign status
    Then it should succeed
