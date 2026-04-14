
# Trigger api gateway deployment upon config change
resource "aws_api_gateway_deployment" "this" {
  depends_on  = [aws_api_gateway_rest_api.this]
  rest_api_id = aws_api_gateway_rest_api.this.id

  // Always re-trigger redeployment of the stage
  triggers = {
    // TODO: Look into neater way of applying this
    // Sha hashing does not appear to detect all of the changes, may need to bring in some other resource  attributes
    redeployment = timestamp()
    # redeployment = sha1(jsonencode(aws_api_gateway_rest_api.this.body))
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Define stage and logging into cloudwatch
resource "aws_api_gateway_stage" "this" {
  #checkov:skip=CKV2_AWS_51: "Ensure AWS API Gateway endpoints uses client certificate authentication" - Not needed
  #checkov:skip=CKV_AWS_120: "Ensure API Gateway caching is enabled" - Re-evaluate later - currently API should not need caching as we are not serving static content"
  deployment_id        = aws_api_gateway_deployment.this.id
  rest_api_id          = aws_api_gateway_rest_api.this.id
  stage_name           = "api"
  xray_tracing_enabled = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.this.arn
    format = jsonencode({
      "requestId"         = "$context.requestId"
      "extendedRequestId" = "$context.extendedRequestId"
      "ip"                = "$context.identity.sourceIp"
      "caller"            = "$context.identity.caller"
      "user"              = "$context.identity.user"
      "requestTime"       = "$context.requestTime"
      "httpMethod"        = "$context.httpMethod"
      "resourcePath"      = "$context.resourcePath"
      "status"            = "$context.status"
      "protocol"          = "$context.protocol"
      "responseLength"    = "$context.responseLength"
    })
  }
}

// Enabling api gateway logging
resource "aws_api_gateway_method_settings" "method" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  stage_name  = aws_api_gateway_stage.this.stage_name
  method_path = "*/*"

  settings {
    logging_level        = "INFO"
    data_trace_enabled   = false
    metrics_enabled      = true
    caching_enabled      = true
    cache_data_encrypted = true
  }
}
