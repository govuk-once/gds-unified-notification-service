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
          AWS     = data.aws_caller_identity.current.account_id
        }
      },
    ]
  })
  tags = var.tags
}

# Gives the Lambda identity permission to interact with SQS
resource "aws_iam_role_policy" "lambda_to_queue" {
  count = length(var.publish_queue_arns) > 0 ? 1 : 0

  name = join("-", [var.prefix, "iamr", var.function_name, "to-queue"])
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      // Allow role assumptions
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = var.publish_queue_arns
      },
    ]
  })
}

# Gives the Lambda identity permission to interact with SSM
resource "aws_iam_role_policy" "lambda_to_ssm" {
  name = join("-", [var.prefix, "iamr", var.function_name, "to-ssm"])
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      // Allow role assumptions
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/${var.prefix}/*"
      }
    ]
  })
}

# Any core policies to attach to role
resource "aws_iam_role_policy_attachment" "core_policies" {
  for_each = { for policy in [
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    # Allow lambdas to consume messages
    "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole",
    # Allow lambdas to connect to VPCs
    "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole",
    # Cloudwatch and XRay log writing
    "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
  ] : policy => policy }

  role       = aws_iam_role.lambda.name
  policy_arn = each.key
}

resource "aws_iam_role_policy_attachment" "sqs_queue_execution_role" {
  count = var.trigger_queue_arn != null ? 1 : 0

  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

# Any additional policies to attach to role injected via module variables
resource "aws_iam_role_policy_attachment" "additional_policies" {
  for_each = var.additional_policy_arns

  role       = aws_iam_role.lambda.name
  policy_arn = each.value
}

// Explicit KMS Access
data "aws_iam_policy_document" "lambda_kms" {
  version = "2012-10-17"
  statement {
    actions = [
      "kms:Decrypt", "kms:GenerateDataKey"
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

resource "aws_iam_role_policy_attachment" "lambda_kms_policy_attachment" {
  role       = aws_iam_role.lambda.name
  policy_arn = aws_iam_policy.lambda_kms_policy.arn
}
