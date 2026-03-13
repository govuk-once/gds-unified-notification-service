// Deploy SQS Queue
resource "aws_sqs_queue" "this" {
  // Metadata
  name = join("-", [var.prefix, "sqs", var.queue_name])
  tags = var.tags

  // Configure instance
  delay_seconds              = var.delay_seconds
  max_message_size           = var.max_message_size
  message_retention_seconds  = var.message_retention_seconds
  receive_wait_time_seconds  = var.receive_wait_time_seconds
  visibility_timeout_seconds = var.visibility_timeout_seconds

  // Encrypt at rest
  kms_master_key_id                 = var.kms_key_arn
  kms_data_key_reuse_period_seconds = var.kms_data_key_reuse_period_seconds
}

resource "aws_sqs_queue" "dead_letter_queue" {
  count = var.create_dead_letter_queue ? 1 : 0

  name = join("-", [var.prefix, "sqs", var.queue_name, "dlq"])
  tags = var.tags

  delay_seconds             = var.dead_letter_queue_delay_seconds
  message_retention_seconds = var.dead_letter_queue_message_retention_seconds
  receive_wait_time_seconds = var.receive_wait_time_seconds

  kms_master_key_id                 = var.kms_key_arn
  kms_data_key_reuse_period_seconds = var.kms_data_key_reuse_period_seconds
}

resource "aws_sqs_queue_redrive_policy" "this" {
  count = var.create_dead_letter_queue ? 1 : 0

  queue_url = aws_sqs_queue.this.url
  redrive_policy = jsondecode({
    deadLetterTargetArn = aws_sqs_queue.dead_letter_queue[0].arn
    maxReceiveCount     = var.max_receieve
  })
}
