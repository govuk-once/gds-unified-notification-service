output "arn" {
  description = "The ARN of the SSM parameter"
  value       = aws_ssm_parameter.secret.arn
}
