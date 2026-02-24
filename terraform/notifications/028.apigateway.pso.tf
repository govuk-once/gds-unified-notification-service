
module "api_gateway_pso" {
  source = "./modules/apigateway"
  // Metadata
  name       = "pso"
  prefix     = local.prefix
  region     = var.region
  stage_name = "api"

  // Config
  kms_key_arn = aws_kms_key.main.arn

  // Lambdas
  integrations = {
    "getHealthcheck" = {
      path                 = "status"
      method               = "GET"
      lambda_function_name = module.lambda_pso_getHealthcheck.lambda_function_name
      lambda_invoke_arn    = module.lambda_pso_getHealthcheck.lambda_invoke_arn
    },
    "postMessage" = {
      path                 = "send"
      method               = "POST"
      lambda_function_name = module.lambda_pso_postMessage.lambda_function_name
      lambda_invoke_arn    = module.lambda_pso_postMessage.lambda_invoke_arn
    }
  }
}

