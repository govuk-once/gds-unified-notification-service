Feature: Delete Notification By Id
  ##################
  #  Unhappy path  #
  ##################
  @Flex @CIOnly
  Scenario: Insecure protocol
    Given a FLEX API client configured with an insecure HTTP
    When I send a DELETE request to "/notifications/{knownNotificationId}"
    Then the DELETE request should fail with a connection protocol error

  @Flex
  Scenario: Invalid api key
    Given a FLEX API client configured with an invalid api key
    When I send a DELETE request to "/notifications/{knownNotificationId}"
    Then the DELETE request should fail with a 403

  @Flex
  Scenario: Missing pushID
    Given a FLEX API client configured correctly
    When I send a DELETE request to "/notifications/{knownNotificationId}?pushID={missing}"
    Then the DELETE request should fail with a 400

  @Flex
  Scenario: Non existing notification
    Given a FLEX API client configured correctly
    When I send a DELETE request to "/notifications/{unknownNotificationId}?pushID={knownPushId}"
    Then the DELETE request should fail with a 404

  @Flex
  Scenario: Not the owner
    Given a FLEX API client configured correctly
    When I send a DELETE request to "/notifications/{knownNotificationId}?pushID={otherUserPushId}"
    Then the DELETE request should fail with a 404
