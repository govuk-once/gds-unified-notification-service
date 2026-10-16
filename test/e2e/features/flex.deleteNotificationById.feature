Feature: Delete Notification By Id
  ##################
  #  Unhappy path  #
  ##################
  @Flex
  Scenario: Insecure protocol
    Given a 'Flex' API client configured with an insecure HTTP
    When I send a 'DELETE' request to "/notifications/$KNOWN_IDS_VALID_NOTIFICATION$"
    Then the 'DELETE' request should fail with a connection protocol error

  @Flex
  Scenario: Invalid api key
    Given a 'Flex' API client configured with an invalid api key
    When I send a 'DELETE' request to "/notifications/$KNOWN_IDS_VALID_NOTIFICATION$"
    Then the 'DELETE' request should fail with a 403

  @Flex
  Scenario: Missing pushID
    Given a 'Flex' API client configured correctly
    When I send a 'DELETE' request to "/notifications/$KNOWN_IDS_VALID_NOTIFICATION$?pushID=$MISSING_ID$"
    Then the 'DELETE' request should fail with a 400

  @Flex
  Scenario: Non existing notification
    Given a 'Flex' API client configured correctly
    When I send a 'DELETE' request to "/notifications/$RANDOM_UUID$?pushID=KNOWN_IDS_VALID_PUSH_ID"
    Then the 'DELETE' request should fail with a 404

  @Flex
  Scenario: Not the owner
    Given a 'Flex' API client configured correctly
    When I send a 'DELETE' request to "/notifications/$KNOWN_IDS_VALID_NOTIFICATION$?pushID=KNOWN_IDS_VALID_PUSH_ID"
    Then the 'DELETE' request should fail with a 404
