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

    // TODO: Consider whether moving this struct into dynamodb module would be a nice solution
    // TODO: Similarly, might be worth refactoring this into a single struct to reduce SSM requests
    // Dynamo table config
    "table/inbound/name" = module.dynamodb_inbound_messages.table_name
    "table/inbound/attributes" = jsonencode({
      hashKey    = module.dynamodb_inbound_messages.table_hash_key
      rangeKey   = module.dynamodb_inbound_messages.table_range_key
      attributes = module.dynamodb_inbound_messages.table_attributes
    })
    "table/inbound/expiration/attribute"         = module.dynamodb_inbound_messages.ttl_attribute
    "table/inbound/expiration/durationInSeconds" = 60 * 60 * 24 * 30

    # MTLS Configuration, pulls config entries exported by mtls repo within same aws account/env
    # Note: This will require mtls repo to be deployed before service & if changes are made, would require redeploygment, however it also allows decoupling of repositories and configs to be passed dynamically through shared channels (SSM)
    // MTLS Configuration - Manual step post initial deployment, based on mtls configuration
    "table/mtls/name"       = local.mtls_table_name
    "table/mtls/attributes" = local.mtls_table_attributes
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
    "config/dispatch/onesignal/apiKey" = "placeholder"
    #checkov:skip=CKV_SECRET_6: "Base64 High Entropy String"
    "config/dispatch/onesignal/appId"                             = "placeholder"
    "config/common/cache/notificationsProviderRateLimitPerMinute" = "5"

    #checkov:skip=CKV_SECRET_6: "Base64 High Entropy String"
    "api/flex/apiKey" = "mockApiKey"

    # Default values for url content control within the data
    "content/allowed/protocols"     = "govuk:,https:"
    "content/allowed/urlHostnames"  = "*.gov.uk"
    "notification/deeplinkTemplate" = "govuk://app.gov.uk/notificationcentre/detail?id={id}"
  }
}
