# Create dedicated log group
resource "aws_cloudwatch_log_group" "this" {
  #checkov:skip=CKV_AWS_338: "Ensure CloudWatch log groups retains logs for at least 1 year" - duration of retentil to be decided

  name              = "/aws/apigw/${aws_api_gateway_rest_api.this.name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}
