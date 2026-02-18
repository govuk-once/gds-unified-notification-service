moved {
  from = module.api_gateway_integration["getNotifications"].aws_api_gateway_resource.this
  to   = aws_api_gateway_resource.shared["notifications"]
}

module "api_gateway_flex" {
  source = "./modules/apigateway"
  // Metadata
  name       = "flex"
  prefix     = local.prefix
  region     = var.region
  stage_name = "api"

  // Config
  kms_key_arn = aws_kms_key.main.arn

  shared_path_resources = {
    "notifications" = {
      parent_id = null
      path_part = "notifictions"
    }
  }

  // Lambdas
  integrations = {
    "getNotifications" = {
      path                 = "notifications"
      method               = "GET"
      lambda_function_name = module.lambda_getFlexNotification.lambda_function_name
      lambda_invoke_arn    = module.lambda_getFlexNotification.lambda_invoke_arn
      existing_path_resource_ids = {
        "0" = "notifications"
      }
    },
    "patchNotifications" = {
      path                 = "notifications/{notificationID}/status"
      method               = "PATCH"
      lambda_function_name = module.lambda_patchFlexNotification.lambda_function_name
      lambda_invoke_arn    = module.lambda_patchFlexNotification.lambda_invoke_arn
      existing_path_resource_ids = {
        "0" = "notifications"
      }
    }
  }
}

