module "dynamodb_inbound_messages" {
  source     = "./modules/dynamo"
  prefix     = local.prefix
  table_name = "inboundMessages"
  hash_key   = "NotificationID"
  // TODO: Works with null, does not work with an explicit range index
  range_key   = null
  kms_key_arn = aws_kms_key.main.arn
  tags        = local.defaultTags
}
