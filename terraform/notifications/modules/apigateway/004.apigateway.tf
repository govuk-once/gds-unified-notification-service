# Create Gateway
resource "aws_api_gateway_rest_api" "this" {
  name = join("-", [var.prefix, "apigw", var.name])

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_wafv2_web_acl_association" "this" {
  resource_arn = aws_api_gateway_stage.this.arn
  web_acl_arn  = aws_wafv2_web_acl.waf_for_apig.arn
}
