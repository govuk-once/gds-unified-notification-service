output "apigw_name" {
  description = "Name of the APIGW"
  value       = aws_api_gateway_rest_api.this.name
}
