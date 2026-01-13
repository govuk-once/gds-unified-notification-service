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

  // Encryption at rest support for environment variables
  kms_key_arn = var.kms_key_arn

  // Code - encrypted at rest, explicitly signed
  handler                 = "index.handler"
  s3_bucket               = aws_signer_signing_job.code_signing.signed_object[0].s3[0].bucket
  s3_key                  = aws_signer_signing_job.code_signing.signed_object[0].s3[0].key
  source_kms_key_arn      = var.kms_key_arn
  code_signing_config_arn = var.codesigning_config_id


  # Use official otel layer from AWS https://aws.amazon.com/otel/ / https://aws-otel.github.io/docs/getting-started/lambda
  layers = [
    "arn:aws:lambda:eu-west-2:615299751070:layer:AWSOpenTelemetryDistroJs:10"
  ]

  // Enable source maps on all
  environment {
    variables = {
      NODE_OPTIONS   = "--enable-source-maps",
      SERVICE_NAME   = "UNS",
      NAMESPACE_NAME = "global"
      PREFIX         = var.prefix

      # Open Telemetry instrumentation vars
      AWS_LAMBDA_EXEC_WRAPPER              = "/opt/otel-instrument"
      OTEL_AWS_APPLICATION_SIGNALS_ENABLED = "false"
      OTEL_NODE_DISABLED_INSTRUMENTATIONS  = "none"

      // Flags
      AWS_LAMBDA_NODEJS_DISABLE_CALLBACK_WARNING = true
    }
  }

  dynamic "vpc_config" {
    for_each = var.security_group_ids != null && var.subnet_ids != null ? [true] : []
    content {
      subnet_ids                  = var.subnet_ids
      security_group_ids          = var.security_group_ids
      ipv6_allowed_for_dual_stack = false
    }
  }

  // Enable X-Ray tracing 
  tracing_config {
    mode = "Active"
  }

  # Ensure we completed code signing job before
  depends_on = [aws_signer_signing_job.code_signing]
}
