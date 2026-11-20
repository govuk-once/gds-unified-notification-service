
@Pso
Feature: Send Notification to Group

  Scenario Outline: Failed to send notification
    Given a correctly configured PSO client
    And I have joined the following groups:
      | Namespace | Group   | Subgroup   |
      | travel    | France  | DAILY      |
    But <Condition>
    When I attempt to send 1 notification with valid fields to the following group:
      | Namespace | Group   | Subgroup   |
      | travel    | France  | DAILY      |
    Then it should fail with <ExpectedError>

    Examples: Infrastructure test
      | Condition                       | ExpectedError         |
      | the connection is insecure      | a transport error     |
      | my MTLS certificate is missing  | a transport error     |

    Examples: Authentication
      | Condition                       | ExpectedError         |
      | my API key is invalid           | an unauthorised error |

  Scenario Outline: Validation failures
    Given a correctly configured PSO client
    And I have joined the following groups:
      | Namespace | Group   | Subgroup   |
      | travel    | France  | DAILY      |
    When I attempt to send 1 notification <Condition> to the following group:
      | Namespace | Group   | Subgroup   |
      | travel    | France  | DAILY      |
    Then it should fail with a validation error

    Examples: Missing required fields
      | Condition                                            |
      | with no NotificationTitle                            |
      | with no NotificationBody                             |
      | with no request body                                 |

    Examples: Invalid markdown
      | Condition                                            |
      | with an invalid URL in markdown                      |
      | with invalid markdown                                |

    Examples: ExpiresInDays
      | Condition                                            |
      | with a negative ExpiresInDays                        |
      | with a float ExpiresInDays                           |
      | with an ExpiresInDays below the organisation minimum |
      | with an ExpiresInDays above the organisation maximum |
      
    Examples: Missing Group fields
      | Condition                                            |
      | with no Namespace                                    |
      | with no Group                                        |
    
  Scenario: 
    Given a correctly configured PSO client
    And I have joined the following groups:
      | Namespace | Group   | Subgroup   |
      | travel    | France  | DAILY      |
    When I attempt to send 2 notification with the same GroupNotificationID to the following group:
      | Namespace | Group   | Subgroup   |
      | travel    | France  | DAILY      |
    Then it should fail with a validation error

  Scenario: 
    Given a correctly configured PSO client
    And I have joined the following groups:
      | Namespace | Group   | Subgroup   |
      | travel    | France  | DAILY      |
    When I attempt to send 1 notification with valid fields to the following group:
      | Namespace | Group   | Subgroup   |
      | travel    | France  | DAILY      |
    Then it should succeed
