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
      lambda_function_name = module.lambda_flex_getNotifications.lambda_function_name
      lambda_invoke_arn    = module.lambda_flex_getNotifications.lambda_invoke_arn
    },
    "patchNotification" = {
      path                 = "notifications/{notificationId}/status",
      method               = "PATCH"
      lambda_function_name = module.lambda_flex_patchNotification.lambda_function_name
      lambda_invoke_arn    = module.lambda_flex_patchNotification.lambda_invoke_arn
    },
    "getNotificationById" = {
      path                 = "notifications/{notificationId}"
      method               = "GET"
      lambda_function_name = module.lambda_flex_getNotificationById.lambda_function_name
      lambda_invoke_arn    = module.lambda_flex_getNotificationById.lambda_invoke_arn
    },
    "deleteNotification" = {
      path                 = "notifications/{notificationId}"
      method               = "DELETE"
      lambda_function_name = module.lambda_flex_deleteNotification.lambda_function_name
      lambda_invoke_arn    = module.lambda_flex_deleteNotification.lambda_invoke_arn
    }
  }
}
