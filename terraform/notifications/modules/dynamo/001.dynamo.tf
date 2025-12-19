resource "aws_dynamodb_table" "this" {
  name           = "${var.project.name}-${var.table.name}"
  billing_mode   = "PAY_PER_REQUEST"
  read_capacity  = 20
  write_capacity = 20
  hash_key       = var.hash_key
  range_key      = var.range_key

  attribute {
    name         = var.hash_key
    type         = "S"
  }

  tags      = merge(var.global_tags, {
  Name      = "${var.project.name}-${var.table.name}"
  })
}
