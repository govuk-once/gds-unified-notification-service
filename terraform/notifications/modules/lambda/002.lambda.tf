resource "aws_lambda_function" "this" {
  filename         = var.bundle_path
  function_name    = join("-", [var.prefix, "lmbd", var.function_name])
  role             = aws_iam_role.lambda.arn
  handler          = "index.handler"
  source_code_hash = filebase64sha512(var.bundle_path)
  runtime          = var.runtime
  memory_size      = var.memory_size
  timeout          = var.timeout

  // Enable source maps
  environment {
    variables = {
      NODE_OPTIONS = "--enable-source-maps"
    }
  }

  tags = var.tags
}
