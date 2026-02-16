
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
    "getHealthCheck" = {
      path                 = "status"
      method               = "GET"
      lambda_function_name = module.lambda_getHealthcheck.lambda_function_name
      lambda_invoke_arn    = module.lambda_getHealthcheck.lambda_invoke_arn
    },
    "postMessage" = {
      path                 = "send"
      method               = "POST"
      lambda_function_name = module.lambda_postMessage.lambda_function_name
      lambda_invoke_arn    = module.lambda_postMessage.lambda_invoke_arn
    }
  }

  // Enable mtls
  route_53_zone       = var.account_domain
  mtls_truststore_url = "s3://${module.certificatestorage.bucket}/${aws_s3_object.truststore.key}"
}

