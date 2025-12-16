# Create dedicated log group
resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/apigw/${var.name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}
