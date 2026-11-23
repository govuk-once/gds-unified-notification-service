@Pso
Feature: Send Notification to Group

  Scenario Outline: Failed to send notification
    Given a correctly configured PSO client
    And I have joined the following groups:
      | Namespace | Group   | Subgroup   |
      | UNS-E2E   | France  | DAILY      |
    But <Condition>
    When I attempt to send 1 notification with valid fields to the following group:
      | Namespace | Group   | Subgroup   |
      | UNS-E2E   | France  | DAILY      |
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
      | UNS-E2E   | France  | DAILY      |
    When I attempt to send 1 notification <Condition> to the following group:
      | Namespace | Group   | Subgroup   |
      | UNS-E2E   | France  | DAILY      |
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

  Scenario: Duplicate GroupNotificationIDs
    Given a correctly configured PSO client
    And I have joined the following groups:
      | Namespace | Group   | Subgroup   |
      | UNS-E2E   | France  | DAILY      |
    When I attempt to send 2 notifications with the same GroupNotificationID to the following group:
      | Namespace | Group   | Subgroup   |
      | UNS-E2E   | France  | DAILY      |
    Then it should fail with a validation error

  Scenario Outline: Successfully sends a group notification & processes it
    Given a correctly configured PSO client
    And I have joined the following groups:
      | Namespace | Group   | Subgroup   |
      | UNS-E2E   | France  | DAILY      |
    When I attempt to send 1 notification <Variation> to the following group:
      | Namespace | Group   | Subgroup   |
      | UNS-E2E   | France  | DAILY      |
    And I attempt to get the campaign status for processed group notifications
    Then it should succeed

    Examples: Base
      | Variation                                            |
      | with valid fields                                    |

    Examples: ExpiresInDays
      | Variation                                            |
      | with ExpiresInDays at the organisation minimum       |
      | with ExpiresInDays at the organisation maximum       |

    Examples: Channel
      | Variation                                            |
      | with channel PUSH_NOTIFICATION_AND_MESSAGE_CENTRE    |
      | with channel MESSAGE_CENTRE_ONLY                     |
