@Flex
Feature: Get Groups

  Scenario Outline: Failed get groups
    Given a correctly configured FLEX client
    And I have joined the following groups:
      | Namespace | Group   | Subgroup   |
      | travel    | France  | DAILY      |
    But <Condition>
    When I attempt to get subscribed groups
    Then it should fail with <ExpectedError>

    @CIOnly
    Examples: Infrastructure test
      | Condition                  | ExpectedError           |
      | the connection is insecure | a connection error      |

    Examples: Authentication
      | Condition                  | ExpectedError           |
      | my API key is invalid      | an authentication error |

  Scenario: Fails when push ID is missing
    Given a correctly configured FLEX client
    But my push ID is missing
    When I attempt to get subscribed groups
    Then it should fail with a validation error

  Scenario: Get groups when user has one group
    Given a correctly configured FLEX client
    And I have joined the following groups:
      | Namespace | Group   | Subgroup   |
      | travel    | France  | DAILY      |
    When I attempt to get subscribed groups
    Then it should succeed

  Scenario: Get groups when user has multiple groups
    Given a correctly configured FLEX client
    And I have joined the following groups:
      | Namespace | Group   | Subgroup   |
      | travel    | France  | DAILY      |
      | travel    | Spain   | IMMEDIATE  |
    When I attempt to get subscribed groups
    Then it should succeed

  Scenario: Get groups when group has no subgroup
    Given a correctly configured FLEX client
    And I have joined the following groups:
      | Namespace | Group    | Subgroup  |
      | driving   | weather  |           |
    When I attempt to get subscribed groups
    Then it should succeed

  Scenario: Get groups returns empty when user has no groups
    Given a correctly configured FLEX client
    When I attempt to get subscribed groups
    Then it should succeed
