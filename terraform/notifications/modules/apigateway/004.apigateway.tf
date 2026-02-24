locals {
  api_ops_by_path = tomap({
    for op in var.integrations : op.path => op...
  })
}

# Create Gateway
resource "aws_api_gateway_rest_api" "this" {
  name = join("-", [var.prefix, "apigw", var.name])

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  lifecycle {
    create_before_destroy = true
  }

  // Dynamically build out openapi spec from integration definitions
  body = jsonencode({
    openapi = "3.0.1"
    info = {
      title   = var.name
      version = "1.0"
    }
    paths = {
      for path, ops in local.api_ops_by_path : path => {
        for op in ops : lower(op.method) => {
          x-amazon-apigateway-integration = {
            uri                  = op.lambda_invoke_arn
            httpMethod           = op.method
            connectionType       = "INTERNET"
            httpMethod           = "POST"
            payloadFormatVersion = "2.0"
            type                 = "aws_proxy"
          }
        }
      }
    }
  })
}
