Feature: Get Notification Status
  @Pso
  Scenario: Insecure protocol
    Given a 'Pso' API client configured with an insecure HTTP protocol
    And a valid notification ID path
    When I attempt to get the notification status
    Then the request should fail with a transport error

  @Pso
  Scenario: Missing MTLS Certificates
    Given a 'Pso' API client configured with an insecure HTTP protocol
    And a valid notification ID path
    When I attempt to get the notification status
    Then the request should fail with a transport error

  @Pso
  Scenario: Invalid api key
    Given a 'Pso' API client configured with an invalid api key
    And a valid notification ID path
    When I attempt to get the notification status
    Then the 'GET' request should fail with a 401

  @Pso
  Scenario: Non existing notification
    Given a 'Pso' API client
    And a notificationID points at an non-existing resource
    When I attempt to get the notification status
    Then the 'GET' request should fail with a 404

  @Pso
  Scenario: Get a list of notifications statuses
    Given a 'Pso' API client
    And a valid notification ID path
    And a notification record for that notification ID
    When I attempt to get the notification status
    Then the request should succeeded with a 200
    And a list of notification statues
