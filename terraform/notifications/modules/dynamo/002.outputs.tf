output "table_arn" {
  description = "DynamoDB table ARN"
  value       = aws_dynamodb_table.this.arn
}

output "table_name" {
  description = "DynamoDB table name"
  value       = aws_dynamodb_table.this.name
}

output "table_hash_key" {
  description = "Hash key used by DynamoDB table"
  value       = aws_dynamodb_table.this.hash_key
}

output "table_range_key" {
  description = "Range key by DynamoDB table"
  value       = aws_dynamodb_table.this.range_key
}

output "table_attributes" {
  description = "attributes used by DynamoDB table"
  value       = [for attr in aws_dynamodb_table.this.attribute : attr.name]
}
