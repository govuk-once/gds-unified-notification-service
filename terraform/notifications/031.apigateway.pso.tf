
module "api_gateway_pso" {
  source = "./modules/apigateway"
  // Metadata
  name       = "pso"
  prefix     = local.prefix
  region     = var.region
  stage_name = "api"

  // Config
  kms_key_arn = aws_kms_key.main.arn

  // Custom domain & mtls configuration
  // use_mtls flag allows developers to optionally disable mtls for their sandbox environments (controllable via npm run development:sandbox:setup )
  route_53_zone                = local.mtls_root_domain
  disable_execute_api_endpoint = var.use_mtls ? local.mtls_config_available : false
  mtls_truststore_url          = var.use_mtls ? local.mtls_pso_truststore : null

  // Explicit authorizer, use case: Verifying certificate revocation
  authorizers = {
    "mtsCertificateRevocation" = {
      lambda_arn           = module.lambda_pso_mtlsCertificateRevocationAuthorizer.lambda_arn
      lambda_function_name = module.lambda_pso_mtlsCertificateRevocationAuthorizer.lambda_function_name
      lambda_invoke_arn    = module.lambda_pso_mtlsCertificateRevocationAuthorizer.lambda_invoke_arn
    }
  }

  // Lambdas
  integrations = {
    "getHealthcheck" = {
      path                 = "status"
      method               = "GET"
      lambda_function_name = module.lambda_pso_getHealthcheck.lambda_function_name
      lambda_invoke_arn    = module.lambda_pso_getHealthcheck.lambda_invoke_arn
      authorizer           = "mtsCertificateRevocation"
    },
    "postMessage" = {
      path                 = "send"
      method               = "POST"
      lambda_function_name = module.lambda_pso_postMessage.lambda_function_name
      lambda_invoke_arn    = module.lambda_pso_postMessage.lambda_invoke_arn
    }
  }
}

