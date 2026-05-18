output "apigw_name" {
  description = "Name of the APIGW"
  value       = aws_api_gateway_rest_api.this.name
}
output "waf_name" {
  description = "Name of the APIGW WAF"
  value       = aws_wafv2_web_acl.waf_for_apig.name
}

output "aws_cloudwatch_log_group_arn" {
  description = "The ARN of the cloudwatch log group associated with this api gateway"
  value       = aws_cloudwatch_log_group.this.arn
}

output "rest_api_execution_arn" {
  description = "The execution ARN of the API Gateway API"
  value       = aws_api_gateway_rest_api.this.execution_arn
}
