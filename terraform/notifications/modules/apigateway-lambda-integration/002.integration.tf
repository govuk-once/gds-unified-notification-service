// First path segment 
resource "aws_api_gateway_resource" "segment_1" {
  count = contains(keys(var.shared_segment_keys), "0") ? 0 : 1

  rest_api_id = var.api_gateway_id
  parent_id   = var.api_gateway_root_resource_id
  path_part   = local.path_segments[0]
}

resource "aws_api_gateway_resource" "segment_2" {
  count = local.path_count >= 2 && !contains(keys(var.shared_segment_keys), "1") ? 1 : 0

  rest_api_id = var.api_gateway_id
  parent_id = (
    contains(keys(var.shared_segment_keys), "0")
    ? var.shared_resources[var.shared_segment_keys["0"]].id
  : aws_api_gateway_resource.segment_1[0].id)
  path_part = local.path_segments[1]
}

resource "aws_api_gateway_resource" "segment_3" {
  count = local.path_count >= 3 && !contains(keys(var.shared_segment_keys), "2") ? 1 : 0

  rest_api_id = var.api_gateway_id
  parent_id = (
    contains(keys(var.shared_segment_keys), "1")
    ? var.shared_resources[var.shared_segment_keys["1"]].id
  : aws_api_gateway_resource.segment_2[0].id)
  path_part = local.path_segments[2]
}

// Define method
resource "aws_api_gateway_method" "this" {
  #checkov:skip=CKV_AWS_59: "Ensure there is no open access to back-end resources through API" - TODO - Is being built as part of the mTLS implementation - NOT-52, NOT-53
  #checkov:skip=CKV2_AWS_53: "Ensure AWS API gateway request is validated" - Re-evaluate - request body schemas to be defined at later date

  resource_id = local.final_resource_id
  rest_api_id = var.api_gateway_id
  http_method = var.method

  # Note this will be refactored during PoC implementation of mTLS
  authorization = "NONE"
}

// Link method to lambda - due internal requirements integration http method has to be POST (it is different from method defined above)
resource "aws_api_gateway_integration" "integration" {
  rest_api_id             = local.final_resource_id
  resource_id             = var.api_gateway_id
  http_method             = aws_api_gateway_method.this.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arn
}

# Move this into locals 
locals {
  path_segments = split("/", var.path)
  path_count    = length(local.path_segments)
}

locals {
  final_resource_id = (
    local.path_count == 1 ? (
      contains(keys(var.shared_segment_keys), "0")
      ? var.shared_resources[var.shared_segment_keys["0"]].id
    : aws_api_gateway_resource.segment_1[0].id) :
    local.path_count == 2 ? (
      contains(keys(var.shared_segment_keys), "1")
      ? var.shared_resources[var.shared_segment_keys["1"]].id
    : aws_api_gateway_resource.segment_2[0].id) :
    (
      contains(keys(var.shared_segment_keys), "2")
      ? var.shared_resources[var.shared_segment_keys["2"]].id
      : aws_api_gateway_resource.segment_3[0].id
    )
  )
}

