Feature: Delete Notification By Id
  @Flex
  Scenario: Insecure protocol
    Given a 'Flex' API client configured with an insecure HTTP
    When I send a 'DELETE' request to "/notifications/$VALID_NOTIFICATION$"
    Then the 'DELETE' request should fail with a connection protocol error

  @Flex
  Scenario: Invalid api key
    Given a 'Flex' API client configured with an invalid api key
    When I send a 'DELETE' request to "/notifications/$VALID_NOTIFICATION$"
    Then the 'DELETE' request should fail with a 403

  @Flex
  Scenario: Missing pushID
    Given a 'Flex' API client configured correctly
    When I send a 'DELETE' request to "/notifications/$VALID_NOTIFICATION$?pushID=$MISSING_PUSH_ID$"
    Then the 'DELETE' request should fail with a 400

  @Flex
  Scenario: Non existing notification
    Given a 'Flex' API client configured correctly
    When I send a 'DELETE' request to "/notifications/$NOT_FOUND_NOTIFICATION$?pushID=$VALID_PUSH_ID$"
    Then the 'DELETE' request should fail with a 404

  @Flex
  Scenario: Not the owner
    Given a 'Flex' API client configured correctly
    When I send a 'DELETE' request to "/notifications/$VALID_NOTIFICATION$?pushID=$VALID_PUSH_ID$"
    Then the 'DELETE' request should fail with a 404
