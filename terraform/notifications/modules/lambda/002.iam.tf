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
  for_each = var.publish_queues

  name = join("-", [var.prefix, "iamr", var.function_name, "to-queue", each.key])
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      // Allow role assumptions
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = values(var.publish_queues)
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
        Action   = ["ssm:GetParameter", "ssm:GetParametersByPath"]
        Resource = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/${var.prefix}/*"
      }
    ]
  })
}

// Explicit KMS Access
resource "aws_iam_role_policy" "lambda_to_kms" {
  name = join("-", [var.prefix, "iamr", var.function_name, "to-kms"])
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      // Allow role assumptions
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = var.kms_key_arn,
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "core_policies" {
  for_each = { for policy in flatten([
    # Cloudwatch and XRay log writing
    "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess",
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    # Allow lambdas to consume messages - if there's a trigger queue provided
    length(values(var.trigger_queues)) > 0 ? ["arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"] : [],
    # Allow lambdas to connect to VPCs - if there's subnet ids provided
    var.security_group_ids != null && var.subnet_ids != null ? ["arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"] : [],
    var.security_group_ids != null && var.subnet_ids != null ? ["arn:aws:iam::aws:policy/service-role/AWSLambdaENIManagementAccess"] : [],
  ]) : policy => policy }
  role       = aws_iam_role.lambda.name
  policy_arn = each.key
}

# Any additional policies to attach to role injected via module variables
resource "aws_iam_role_policy_attachment" "additional_policies" {
  for_each   = var.additional_policies
  role       = aws_iam_role.lambda.name
  policy_arn = each.value
}

# DynamoDB IAM access policy 
resource "aws_iam_role_policy" "dynamo_access" {
  for_each = var.dynamo_tables

  role = aws_iam_role.lambda.id
  name = join("-", [var.prefix, "iamr", var.function_name, "dynamo", each.key])

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "dynamodb:BatchWriteItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:PutItem",
          "dynamodb:Scan",
          "dynamodb:UpdateItem"
        ]
        Effect   = "Allow"
        Resource = each.value
      }
    ]
  })
}
