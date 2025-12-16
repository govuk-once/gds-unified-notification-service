# Create Gateway
resource "aws_api_gateway_rest_api" "this" {
  name = join("-", [var.prefix, "apigw", var.name])

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}
