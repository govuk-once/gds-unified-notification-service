// Note: Parameters defined in this module will be updated on every deployment to match the configuration defined by IaC
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
    "table/inbound/attributes" = jsonencode({
      name                        = module.dynamodb_inbound_messages.table_name
      hashKey                     = module.dynamodb_inbound_messages.table_hash_key
      rangeKey                    = module.dynamodb_inbound_messages.table_range_key
      attributes                  = module.dynamodb_inbound_messages.table_attributes
      expirationAttribute         = module.dynamodb_inbound_messages.ttl_attribute
      expirationDurationInSeconds = 60 * 60 * 24 * 30
    })

    # MTLS Configuration, pulls config entries exported by mtls repo within same aws account/env
    # Note: This will require mtls repo to be deployed before service & if changes are made, would require redeployment, however it also allows decoupling of repositories and configs to be passed dynamically through shared channels (SSM)
    // MTLS Configuration - Manual step post initial deployment, based on mtls configuration
    "table/mtls/attributes" = jsonencode(
      merge(
        {
          name = local.mtls_table_name
        },
        jsondecode(local.mtls_table_attributes)
      )
    )
  }
}
