
// Integrate lambdas with api gateway
module "api_gateway_integration" {
  for_each = var.integrations
  source   = "../apigateway-lambda-integration"

  // Api Gateway
  api_gateway_arn              = aws_api_gateway_rest_api.this.arn
  api_gateway_id               = aws_api_gateway_rest_api.this.id
  api_gateway_root_resource_id = aws_api_gateway_rest_api.this.root_resource_id
  api_gateway_execution_arn    = aws_api_gateway_rest_api.this.execution_arn

  // Path
  path   = each.value.path
  method = each.value.method

  // Lambda to handle the definition
  lambda_function_name = each.value.lambda_function_name
  lambda_invoke_arn    = each.value.lambda_invoke_arn
}
