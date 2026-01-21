
module "api_gateway_main" {
  source = "./modules/apigateway"
  // Metadata
  name       = "main"
  prefix     = local.prefix
  region     = var.region
  stage_name = "api"

  // Config
  kms_key_arn = aws_kms_key.main.arn

  // Lambdas
  integrations = {
    "getHealthCheck" = {
      path                 = "status"
      method               = "GET"
      lambda_function_name = module.lambda_getHealthcheck.lambda_function_name
      lambda_invoke_arn    = module.lambda_getHealthcheck.lambda_invoke_arn
    }
  }
}

