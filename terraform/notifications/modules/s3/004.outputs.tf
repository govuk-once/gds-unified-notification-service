
output "id" {
  description = "ARN ID of the bucket"
  value       = aws_s3_bucket.this.id
}

output "bucket" {
  description = "Name of the bucket"
  value       = aws_s3_bucket.this.bucket
}
