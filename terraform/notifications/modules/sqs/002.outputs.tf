output "sqs_queue_name" {
  description = "Function name of the created sqs queue"
  value       = aws_sqs_queue.this.name
}

output "queue_arn" {
  description = "ARN of the created sqs queue"
  value       = aws_sqs_queue.this.arn
}

output "queue_url" {
  description = "URL of the created sqs queue"
  value       = aws_sqs_queue.this.url
}
