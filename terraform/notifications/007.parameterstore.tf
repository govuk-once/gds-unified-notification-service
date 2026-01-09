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

    // Elasticache
    "config/common/cache/name" = aws_elasticache_serverless_cache.example.name
    "config/common/cache/host" = aws_elasticache_serverless_cache.example.endpoint[0].address
    "config/common/cache/user" = aws_elasticache_user.iamUser.user_name
  }
}
