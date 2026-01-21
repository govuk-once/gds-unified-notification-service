output "table_arn" {
  description = "DynamoDB table ARN"
  value       = aws_dynamodb_table.this.arn
}

output "table_name" {
  description = "DynamoDB table name"
  value       = aws_dynamodb_table.this.name
}

output "table_key" {
  description = "Key used by DynamoDB table"
  value       = aws_dynamodb_table.this.hash_key
}
