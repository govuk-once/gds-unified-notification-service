// Deploy lambda
resource "aws_lambda_function" "this" {
  #checkov:skip=CKV_AWS_272: "Ensure AWS Lambda function is configured to validate code-signing" - TODO - Part of NOT-74 ticket / Project not live

  #checkov:skip=CKV_AWS_115: "Ensure that AWS Lambda function is configured for function-level concurrent execution limit" - TODO - Project not live

  #checkov:skip=CKV_AWS_117: "Ensure that AWS Lambda function is configured inside a VPC" - TODO - Re-evaluate - VPCs are not used by design within this project

  #checkov:skip=CKV_AWS_116: "Ensure that AWS Lambda function is configured for a Dead Letter Queue(DLQ)" - TODO - TO DO - SQS Integration is planned in

  // Metadata & IAM
  function_name = join("-", [var.prefix, "lmbd", var.function_name])
  tags          = var.tags
  role          = aws_iam_role.lambda.arn

  // Configure instance
  runtime     = var.runtime
  memory_size = var.memory_size
  timeout     = var.timeout

  // Encrypt at rest
  kms_key_arn = var.kms_key_arn

  // Code - encrypt it at rest
  handler            = "index.handler"
  filename           = var.bundle_path
  source_code_hash   = filebase64sha512(var.bundle_path)
  source_kms_key_arn = var.kms_key_arn

  // Enable source maps on all
  environment {
    variables = {
      NODE_OPTIONS   = "--enable-source-maps",
      SERVICE_NAME   = "UNS",
      NAMESPACE_NAME = "global"
    }
  }

  // Enable X-Ray tracing 
  tracing_config {
    mode = "Active"
  }
}
