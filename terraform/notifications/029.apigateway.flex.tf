module "api_gateway_flex" {
  source = "./modules/apigateway"
  // Metadata
  name       = "flex"
  prefix     = local.prefix
  region     = var.region
  stage_name = "api"

  // Config
  kms_key_arn = aws_kms_key.main.arn

  // Lambdas
  integrations = {
    "getNotifications" = {
      path                 = "notifications"
      method               = "GET"
      lambda_function_name = module.lambda_getFlexNotification.lambda_function_name
      lambda_invoke_arn    = module.lambda_getFlexNotification.lambda_invoke_arn
    },
    "patchNotifications" = {
      path                 = "flexStatus"
      method               = "PATCH"
      lambda_function_name = module.lambda_patchFlexNotification.lambda_function_name
      lambda_invoke_arn    = module.lambda_patchFlexNotification.lambda_invoke_arn
    }
    "postNotifications" = {
      path                 = "notifications"
      method               = "POST"
      lambda_function_name = module.lambda_getFlexNotification.lambda_function_name
      lambda_invoke_arn    = module.lambda_getFlexNotification.lambda_invoke_arn
    }
    "patchById" = {
      path                 = "notifications/{notificationId}/patch",
      method               = "PATCH"
      lambda_function_name = module.lambda_getFlexNotification.lambda_function_name
      lambda_invoke_arn    = module.lambda_getFlexNotification.lambda_invoke_arn
    }
  }
}
