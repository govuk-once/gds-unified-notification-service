# Allow lambdas to assume role
# https://docs.aws.amazon.com/lambda/latest/dg/lambda-intro-execution-role.html#permissions-executionrole-api
resource "aws_iam_role" "lambda" {
  name = join("-", [var.prefix, "iamr", var.function_name])
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      // Allow role assumptions
      {
        Effect = "Allow"
        Action = ["sts:AssumeRole"]
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      },
    ]
  })
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "sqs_queue_execution_role " {
  count = var.trigger_queue_name != null ? 1 : 0

  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

// Explicit KMS Access
data "aws_iam_policy_document" "lambda_kms" {
  version = "2012-10-17"
  statement {
    actions = [
      "kms:Decrypt"
    ]

    resources = [
      var.kms_key_arn,
    ]
  }
}

resource "aws_iam_policy" "lambda_kms_policy" {
  name   = join("-", [var.prefix, "iamp", var.function_name])
  policy = data.aws_iam_policy_document.lambda_kms.json
}

resource "aws_iam_policy_attachment" "lambda_kms_policy_attachment" {
  name       = join("-", [var.prefix, "iampa", var.function_name])
  roles      = [aws_iam_role.lambda.name]
  policy_arn = aws_iam_policy.lambda_kms_policy.arn
}
