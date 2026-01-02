output "table_arn" {
  description       = "GDS DynamoDB table"
  value             = aws_dynamodb_table 
}

output "alpha_table" {
  description       = "Alpha DynamoDB table"
  value             = aws_dynamodb_table.this.name
}
