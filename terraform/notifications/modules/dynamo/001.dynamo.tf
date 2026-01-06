resource "aws_kms_key" "dynamo_db_kms_key" {
  description = "KMS key for DynamoDB encryption"
  deletion_window_in_days = var.deletion_window_in_days
  enable_key_rotation = true
}

resource "aws_dynamodb_table" "this" {
  name           = join("-", [var.project.name, var.table.name])
  billing_mode   = "PAY_PER_REQUEST"
  read_capacity  = var.read_capacity
  write_capacity = var.write_capacity
  hash_key       = var.hash_key
  range_key      = var.range_key

  attribute {
    name         = var.hash_key
    type         = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
    kms_key_arn = aws_kms_key.dynamo_db_kms_key.arn
  }

  tags      = merge(var.tags, {
  Name      = join("-", [var.project.name, var.table.name])
  })
}

point_in_time_recovery {
  enabled = true
}
