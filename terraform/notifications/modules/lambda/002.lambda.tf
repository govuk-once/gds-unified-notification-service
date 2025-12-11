// Deploy lambda
resource "aws_lambda_function" "this" {
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
}
