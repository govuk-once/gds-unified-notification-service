// Creates an x-ray group
resource "aws_xray_group" "lambda" {
  // Metadata
  group_name        = join("-", [var.prefix, "xray", var.xray_group_name])
  filter_expression = var.xray_filter_expression
  tags              = var.tags

  // Config
  insights_configuration {
    insights_enabled      = var.insights_enabled
    notifications_enabled = var.notifications_enabled
  }
}

// Xray encryption configuration
resource "aws_xray_encryption_config" "lambda" {
  type   = "KMS"
  key_id = var.kms_key_arn
}

// Allows lambda to write to xray
resource "aws_iam_policy" "xray_access" {
  name = join("-", [var.prefix, "iamrp", var.function_name, "xraywrite"])

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets",
          "xray:GetSamplingStatisticSummaries"
        ]
        Resource = [aws_cloudwatch_log_group.lambda.arn]
      },
    ]
  })
}
