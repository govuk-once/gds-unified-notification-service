module "parameter_store" {
  source = "./modules/parameter-store"

  namespace   = local.prefix
  kms_key_arn = aws_kms_key.main.arn

  parameters = {
    "config/common/enabled"   = "true"
    "config/ingest/enabled"   = "true"
    "config/process/enabled"  = "true"
    "config/dispatch/enabled" = "true"
    #checkov:skip=CKV_SECRET_6: "Base64 High Entropy String"
    "config/dispatch/onetrust/apikey" = "placeholder"

    // Elasticache config
    "config/common/cache/name" = aws_elasticache_serverless_cache.this.name
    "config/common/cache/host" = aws_elasticache_serverless_cache.this.endpoint[0].address
    "config/common/cache/user" = aws_elasticache_user.this.user_name

    // SQS
    "queue/valid/url"    = "validQueueUrl"
    "queue/complete/url" = "completeQueueUrl"
    "queue/events/url"   = "eventsQueueUrl"

    // Dynamo
    "table/events/name" = "eventsTableName"
  }
}
