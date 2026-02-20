
module "dynamodb_flexNotifications" {
  // Metadata
  source     = "./modules/dynamo"
  prefix     = local.prefix
  table_name = "flexNotifications"

  // Encrpytion at rest
  kms_key_arn = aws_kms_key.main.arn
  tags        = local.defaultTags

  // Fields
  hash_key  = "NotificationID"
  range_key = null
  attributes = [
    {
      name = "NotificationID"
      type = "S"
    }
  ]

  // Indexes
  global_secondary_indexes = []
}

