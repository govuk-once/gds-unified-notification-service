
resource "aws_sqs_queue" "incoming_queue" {
  name = "incoming-message-queue"
}

resource "aws_sqs_queue_policy" "cross_account_access" {
  queue_url = aws_sqs_queue.incoming_queue.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowStagingToSendMessage"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${var.staging_account_id}:root"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.incoming_queue.arn
      }
    ]
  })
}
