module "dynamodb_campaigns" {
  // Metadata
  source     = "./modules/dynamo"
  prefix     = local.prefix
  table_name = "campaigns"

  // Encrpytion at rest
  kms_key_arn = aws_kms_key.main.arn
  tags        = local.defaultTags

  // Fields
  hash_key  = "CompositeID"
  range_key = null
  attributes = [
    {
      name = "CompositeID"
      type = "S"
    },
  ]

  // Indexes
  global_secondary_indexes = []

  // TTL
  ttl_attribute = null
}
