// Note this is the API Gateway that will remain in place once flex integration is completed
module "api_gateway_flex_private" {
  source = "./modules/apigateway"
  // Metadata
  name       = "flex-private"
  prefix     = local.prefix
  region     = var.region
  stage_name = "api"

  // Config
  kms_key_arn                    = aws_kms_key.main.arn
  is_main_environment_in_account = var.is_main_environment_in_account

  // Pull in route53 config, disable mtls
  route_53_zone                = null
  mtls_truststore_url          = null
  disable_execute_api_endpoint = false

  // Only allow traffic from private VPCe's
  private_vpce = local.flex_vpces

  // Lambdas
  integrations = {
    "getNotifications" = {
      path                 = "notifications"
      method               = "GET"
      lambda_function_name = module.lambda_flex_getNotifications.lambda_function_name
      lambda_invoke_arn    = module.lambda_flex_getNotifications.lambda_invoke_arn
    },
    "patchNotification" = {
      path                 = "notifications/{notificationID}/status",
      method               = "PATCH"
      lambda_function_name = module.lambda_flex_patchNotification.lambda_function_name
      lambda_invoke_arn    = module.lambda_flex_patchNotification.lambda_invoke_arn
    },
    "getNotificationById" = {
      path                 = "notifications/{notificationID}"
      method               = "GET"
      lambda_function_name = module.lambda_flex_getNotificationById.lambda_function_name
      lambda_invoke_arn    = module.lambda_flex_getNotificationById.lambda_invoke_arn
    },
    "deleteNotification" = {
      path                 = "notifications/{notificationID}"
      method               = "DELETE"
      lambda_function_name = module.lambda_flex_deleteNotification.lambda_function_name
      lambda_invoke_arn    = module.lambda_flex_deleteNotification.lambda_invoke_arn
    }
  }
}
