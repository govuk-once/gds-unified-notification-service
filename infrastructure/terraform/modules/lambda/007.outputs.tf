output "lambda_function_name" {
  description = "Function name of the created lambda"
  value       = aws_lambda_function.this.function_name
}

output "lambda_arn" {
  description = "ARN of the created lambda"
  value       = aws_lambda_function.this.arn
}

output "lambda_invoke_arn" {
  description = "Invocation ARN f the created lambda"
  value       = aws_lambda_function.this.invoke_arn
}

output "lambda_role" {
  description = "Role used by the lambda"
  value       = aws_iam_role.lambda.name
}

output "lambda_service_name" {
  description = "Service name used by the lambda"
  value       = aws_lambda_function.this.environment[0].variables.SERVICE_NAME
}
