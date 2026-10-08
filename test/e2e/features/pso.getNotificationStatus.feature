Feature: Get Notification Status
  @Pso
  Scenario: Insecure protocol
    Given a 'Pso' API client configured with an insecure HTTP
    When I send a 'GET' request to "/status/$VALID_NOTIFICATION$"
    Then the 'GET' request should fail with a transport error

  @Pso
  Scenario: Missing MTLS Certificates
    Given a 'Pso' API client with missing MTLS certificate
    When I send a 'GET' request to "/status/$VALID_NOTIFICATION$"
    Then the 'GET' request should fail with a transport error

  @Pso
  Scenario: Invalid api key
    Given a 'Pso' API client configured with an invalid api key
    When I send a 'GET' request to "/status/$VALID_NOTIFICATION$"
    Then the 'GET' request should fail with a 401

  @Pso
  Scenario: Non existing notification
    Given a 'Pso' API client configured correctly
    When I send a 'GET' request to "/status/$NOT_FOUND_NOTIFICATION$"
    Then the 'GET' request should fail with a 404

  @Pso
  Scenario: Get a list of notifications statuses
    Given a 'Pso' API client configured correctly
    And a notification record for that notification ID
    When I send a 'GET' request to "/status/$VALID_NOTIFICATION$"
    Then the 'GET' request should succeeded with a 200
    And a list of notification statues
