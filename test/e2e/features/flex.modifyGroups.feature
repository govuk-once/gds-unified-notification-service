@Flex
Feature: Modify Groups

  Scenario Outline: Failed group modification
    Given my FLEX client is configured <Configuration>
    When I attempt to modify groups with a <PushIdState> push ID
      | Action | Namespace | Group  | Subgroup |
      | JOIN   | travel    | France | DAILY    |
    Then the POST request should fail with a <StatusCode>

    @CIOnly
    Examples: Infrastructure test
      | Configuration           | PushIdState | StatusCode |
      | insecurely              | valid       | 500        |

    Examples: Authentication + Data Validation
      | Configuration           | PushIdState | StatusCode |
      | with an invalid api key | valid       | 403        |
      | correctly               | missing     | 400        |
  
  Scenario: Fails when request body is missing
    Given my FLEX client is configured correctly
    When I set the path to "/v1/groups"
    And I send a POST request with an empty body
    Then the POST request should fail with a 400

  Scenario: Join a single group successfully
    Given my FLEX client is configured correctly
    When I attempt to modify groups with a valid push ID
      | Action | Namespace | Group  | Subgroup  |
      | JOIN   | travel    | France | DAILY     |
    Then the POST request should succeed with a 200
    And contain valid request body

  Scenario: Leave a single group successfully
    Given my FLEX client is configured correctly
    When I attempt to modify groups with a valid push ID
      | Action | Namespace | Group  | Subgroup  |
      | LEAVE  | travel    | France | DAILY     |
    Then the POST request should succeed with a 200
    And contain valid request body

  Scenario: Join multiple groups in one request
    Given my FLEX client is configured correctly
    When I attempt to modify groups with a valid push ID
      | Action | Namespace | Group  | Subgroup  |
      | JOIN   | travel    | France | DAILY     |
      | JOIN   | travel    | Spain  | IMMEDIATE |
    Then the POST request should succeed with a 200
    And contain valid request body

  Scenario: Leave one group and join another in one request
    Given my FLEX client is configured correctly
    When I attempt to modify groups with a valid push ID
      | Action | Namespace | Group    | Subgroup  |
      | LEAVE  | travel    | Spain    | IMMEDIATE |
      | JOIN   | travel    | Portugal | DAILY     |
    Then the POST request should succeed with a 200
    And contain valid request body
  
  Scenario: Leave multiple groups in one request
    Given my FLEX client is configured correctly
    When I attempt to modify groups with a valid push ID
      | Action | Namespace | Group    | Subgroup  |
      | LEAVE  | travel    | Portugal | DAILY     |
      | LEAVE  | travel    | France   | DAILY     |
    Then the POST request should succeed with a 200
    And contain valid request body

  Scenario: Join a group without a subgroup
    Given my FLEX client is configured correctly
    When I attempt to modify groups with a valid push ID
      | Action | Namespace | Group    | Subgroup  |
      | JOIN   | driving   | weather  |           |
    Then the POST request should succeed with a 200
    And contain valid request body

  Scenario: Leave a group without a subgroup
    Given my FLEX client is configured correctly
    When I attempt to modify groups with a valid push ID
      | Action | Namespace | Group    | Subgroup  |
      | LEAVE  | driving   | weather  |           |
    Then the POST request should succeed with a 200
    And contain valid request body


