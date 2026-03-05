
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
  disable_execute_api_endpoint = local.mtls_enabled
  mtls_truststore_url          = local.mtls_enabled ? local.mtls_pso_truststore : null

  // Explicit authorizer, use case: Verifying certificate revocation
  authorizers = local.mtls_enabled ? {
    "mtsCertificateRevocation" = {
      lambda_arn           = module.lambda_pso_mtlsCertificateRevocationAuthorizer.lambda_arn
      lambda_function_name = module.lambda_pso_mtlsCertificateRevocationAuthorizer.lambda_function_name
      lambda_invoke_arn    = module.lambda_pso_mtlsCertificateRevocationAuthorizer.lambda_invoke_arn
    }
  } : {}

  // Lambdas
  integrations = {
    "getHealthcheck" = {
      path                 = "status"
      method               = "GET"
      lambda_function_name = module.lambda_pso_getHealthcheck.lambda_function_name
      lambda_invoke_arn    = module.lambda_pso_getHealthcheck.lambda_invoke_arn
      authorizer           = local.mtls_enabled ? "mtsCertificateRevocation" : null
    },
    "postMessage" = {
      path                 = "send"
      method               = "POST"
      lambda_function_name = module.lambda_pso_postMessage.lambda_function_name
      lambda_invoke_arn    = module.lambda_pso_postMessage.lambda_invoke_arn
      authorizer           = local.mtls_enabled ? "mtsCertificateRevocation" : null
    }
  }
}

