resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  // Trigger
  count   = var.trigger_queue_name != null ? { trigger : true } : {}
  enabled = true

  // Metadata
  event_source_arn = var.trigger_queue_name
  function_name    = aws_lambda_function.this.arn
  tags             = var.tags

  // Configure instance
  batch_size = var.batch_size
  scaling_config {
    maximum_concurrency = var.maximum_concurrency
  }
}
