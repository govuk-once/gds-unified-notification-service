module "dynamodb_events" {
  // Metadata
  source     = "./modules/dynamo"
  prefix     = local.prefix
  table_name = "events"

  // Encrpytion at rest
  kms_key_arn = aws_kms_key.main.arn
  tags        = local.defaultTags

  // Fields
  hash_key  = "EventID"
  range_key = "EventDateTime"
  attributes = [
    {
      name = "EventID"
      type = "S"
    },
    {
      name = "EventDateTime"
      type = "S"
    },
    {
      name = "NotificationID"
      type = "S"
    },
    {
      name = "DepartmentID"
      type = "S"
    },
  ]

  // Indexes
  global_secondary_indexes = [
    {
      name               = "NotificationIDIndex"
      hash_key           = "EventID"
      range_key          = "NotificationID"
      projection_type    = "INCLUDE"
      non_key_attributes = ["EventTimesamp"]
    },
    {
      name               = "DepartmentIDIndex"
      hash_key           = "EventID"
      range_key          = "DepartmentID"
      projection_type    = "INCLUDE"
      non_key_attributes = ["EventTimesamp"]
    },
  ]
}
