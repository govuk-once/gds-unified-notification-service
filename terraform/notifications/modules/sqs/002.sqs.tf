// Deploy SQS Queue
resource "aws_sqs_queue" "this" {
  // Metadata
  name                      = var.queue_name
  tags                      = var.tags

  // Configure instance
  delay_seconds             = var.delay_seconds
  max_message_size          = var.max_message_size
  message_retention_seconds = var.message_retention_seconds
  receive_wait_time_seconds = var.receive_wait_time_seconds
}
