output "apigw_name" {
  description = "Name of the APIGW"
  value       = aws_api_gateway_rest_api.this.name
}
output "waf_name" {
  description = "Name of the APIGW WAF"
  value       = aws_wafv2_web_acl.waf_for_apig.name
}
