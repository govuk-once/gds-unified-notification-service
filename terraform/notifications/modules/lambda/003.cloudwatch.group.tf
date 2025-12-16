# Create dedicated log group
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${aws_lambda_function.this.function_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

# Allow lambda to write logs to cloudwatch
resource "aws_iam_role_policy" "cloudwatch_logs" {
  name = join("-", [var.prefix, "iamrp", var.function_name, "logwrite"])
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = [aws_cloudwatch_log_group.lambda.arn]
      },
    ]
  })
}

