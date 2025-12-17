// Define path
resource "aws_api_gateway_resource" "this" {
  rest_api_id = var.api_gateway_id
  parent_id   = var.api_gateway_root_resource_id
  path_part   = var.path
}

// Define method
resource "aws_api_gateway_method" "this" {
  #checkov:skip=CKV_AWS_59: "Ensure there is no open access to back-end resources through API" - TODO - Is being built as part of the mTLS implementation - NOT-52, NOT-53
  #checkov:skip=CKV2_AWS_53: "Ensure AWS API gateway request is validated" - Re-evaluate - request body schemas to be defined at later date

  resource_id = aws_api_gateway_resource.this.id
  rest_api_id = aws_api_gateway_resource.this.rest_api_id
  http_method = var.method

  # Note this will be refactored during PoC implementation of mTLS
  authorization = "NONE"
}

// Link method to lambda - due internal requirements integration http method has to be POST (it is different from method defined above)
resource "aws_api_gateway_integration" "integration" {
  rest_api_id             = aws_api_gateway_resource.this.rest_api_id
  resource_id             = aws_api_gateway_resource.this.id
  http_method             = aws_api_gateway_method.this.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arn
}
