@Pso
Feature: Send Notification

  Scenario Outline: Failed to send notification
    Given a correctly configured PSO client
    But <Condition>
    When I attempt to send a notification with valid fields
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
    When I attempt to send a notification <Condition>
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

    Examples: Duplicates
      | Condition                                            |
      | with duplicate NotificationIDs                       |

    Examples: DeeplinkURL
      | Condition                                            |
      | with a DeeplinkURL with a disallowed hostname        |
      | with a DeeplinkURL with a disallowed protocol        |

  Scenario Outline: Successfully sends a notification & acquires validated status
    Given a correctly configured PSO client
    When I attempt to send a notification <Variation>
    And I attempt to get the status of a notification
    Then it should succeed

    Examples: Base
      | Variation                                            |
      | with valid fields                                    |

    Examples: Markdown
      | Variation                                            |
      | with valid markdown                                  |

    Examples: Optional fields
      | Variation                                            |
      | without a DepartmentID                               |

    Examples: ExpiresInDays
      | Variation                                            |
      | with a valid ExpiresInDays                           |
      | with ExpiresInDays at the organisation minimum       |
      | with ExpiresInDays at the organisation maximum       |

    Examples: Channel
      | Variation                                            |
      | with channel PUSH_NOTIFICATION_AND_MESSAGE_CENTRE    |
      | with channel MESSAGE_CENTRE_ONLY                     |
  