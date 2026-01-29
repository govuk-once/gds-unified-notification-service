module "parameter_store_internal_configuration" {
  source = "./modules/parameter-store"

  namespace   = local.prefix
  kms_key_arn = aws_kms_key.main.arn

  // Update values in place based on supplied values
  update_values = true

  parameters = {
    // Elasticache config
    "config/common/cache/name" = aws_elasticache_serverless_cache.this.name
    "config/common/cache/host" = aws_elasticache_serverless_cache.this.endpoint[0].address
    "config/common/cache/user" = aws_elasticache_user.this.user_name

    // SQS
    "queue/processing/url" = module.sqs_processing.queue_url
    "queue/dispatch/url"   = module.sqs_dispatch.queue_url
    "queue/analytics/url"  = module.sqs_analytics.queue_url

    // Dynamo
    "table/events/name"  = module.dynamodb_events.table_name
    "table/events/key"   = module.dynamodb_events.table_key
    "table/inbound/name" = module.dynamodb_inbound_messages.table_name
    "table/inbound/key"  = module.dynamodb_inbound_messages.table_key
  }
}

module "parameter_store_external_configuration" {
  source = "./modules/parameter-store"

  namespace   = local.prefix
  kms_key_arn = aws_kms_key.main.arn

  // Values are created with placeholder and developers are expected to manually update them externally
  update_values = false

  parameters = {
    "config/common/enabled"     = "true"
    "config/validation/enabled" = "true"
    "config/processing/enabled" = "true"
    "config/dispatch/enabled"   = "true"

    "config/dispatch/adapter" = "VOID" # Enum: VOID, OneSignal
    #checkov:skip=CKV_SECRET_6: "Base64 High Entropy String"
    "config/dispatch/onesignal/apikey" = "placeholder"
    #checkov:skip=CKV_SECRET_6: "Base64 High Entropy String"
    "config/dispatch/onesignal/appId" = "placeholder"

    "api/postmessage/apikey" = "mockApiKey"
  }
}
