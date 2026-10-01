Feature: Delete Notification By Id
  @Flex
  Scenario: Insecure protocol
    Given a 'Flex' API client configured with an insecure HTTP protocol
    And a valid notification ID path
    When I attempt to delete the notification
    Then the request should fail with a connection protocol error

  @Flex
  Scenario: Invalid api key
    Given a 'Flex' API client configured with an invalid api key
    And a valid notification ID path
    When I attempt to delete the notification
    Then the 'DELETE' request should fail with a 403

  @Flex
  Scenario: Missing pushID
    Given a 'Flex' API client
    And a valid notification ID path
    And no pushID
    When I attempt to delete the notification
    Then the 'DELETE' request should fail with a 400

  @Flex
  Scenario: Non existing notification
    Given a 'Flex' API client
    And a notificationID points at an non-existing resource
    And with a pushID
    When I attempt to delete the notification
    Then the 'DELETE' request should fail with a 404

  @Flex
  Scenario: Not the owner
    Given a 'Flex' API client
    And a valid notification ID path
    And with a pushID that is no associated with the notification
    When I attempt to delete the notification
    Then the 'DELETE' request should fail with a 404
