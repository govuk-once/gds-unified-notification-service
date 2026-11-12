@Flex
Feature: Modify Groups

  Scenario Outline: Failed group modification
    Given a correctly configured FLEX client
    But <Condition>
    When I send a single request to modify the following groups:
      | Action | Namespace | Group  | Subgroup |
      | join   | travel    | France | DAILY    |
    Then it should fail with <ExpectedError>

    @CIOnly
    Examples: Infrastructure test
      | Condition                  | ExpectedError           |
      | the connection is insecure | a connection error      |

    Examples: Authentication + Data Validation
      | Condition                  | ExpectedError           |
      | my API key is invalid      | an authentication error |
      | my push ID is missing      | a validation error      |

  Scenario: Fails when no request body is sent
    Given a correctly configured FLEX client
    When I attempt to modify groups without a request body
    Then it should fail with a validation error

  Scenario: Fails when group is missing
    Given a correctly configured FLEX client
    When I send a single request to modify the following groups:
      | Action | Namespace | Group | Subgroup |
      | join   | travel    |       | DAILY    |
    Then it should fail with a validation error

  Scenario: Fails when namespace is missing
    Given a correctly configured FLEX client
    When I send a single request to modify the following groups:
      | Action | Namespace | Group  | Subgroup |
      | join   |           | France | DAILY    |
    Then it should fail with a validation error

  Scenario: Join a single group successfully
    Given a correctly configured FLEX client
    When I send a single request to modify the following groups:
      | Action | Namespace | Group   | Subgroup   |
      | join   | travel    | France  | DAILY      |
    Then it should succeed

  Scenario: Leave a single group successfully
    Given a correctly configured FLEX client
    When I send a single request to modify the following groups:
      | Action | Namespace | Group   | Subgroup   |
      | leave  | travel    | France  | DAILY      |
    Then it should succeed

  Scenario: Join multiple groups in one request
    Given a correctly configured FLEX client
    When I send a single request to modify the following groups:
      | Action | Namespace | Group   | Subgroup   |
      | join   | travel    | France  | DAILY      |
      | join   | travel    | Spain   | IMMEDIATE  |
    Then it should succeed

  Scenario: Leave one group and join another in one request
    Given a correctly configured FLEX client
    When I send a single request to modify the following groups:
      | Action | Namespace | Group    | Subgroup  |
      | leave  | travel    | Spain    | IMMEDIATE |
      | join   | travel    | Portugal | DAILY     |
    Then it should succeed

  Scenario: Leave multiple groups in one request
    Given a correctly configured FLEX client
    When I send a single request to modify the following groups:
      | Action | Namespace | Group    | Subgroup  |
      | leave  | travel    | Portugal | DAILY     |
      | leave  | travel    | France   | DAILY     |
    Then it should succeed

  Scenario: Join a group without a subgroup
    Given a correctly configured FLEX client
    When I send a single request to modify the following groups:
      | Action | Namespace | Group    | Subgroup  |
      | join   | driving   | weather  |           |
    Then it should succeed

  Scenario: Leave a group without a subgroup
    Given a correctly configured FLEX client
    When I send a single request to modify the following groups:
      | Action | Namespace | Group    | Subgroup  |
      | leave  | driving   | weather  |           |
    Then it should succeed

