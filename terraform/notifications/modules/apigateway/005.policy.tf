
resource "aws_api_gateway_rest_api_policy" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      // Allow traffic from source VPCe's - if they're defined
      // Otherwise, do not add the condition
      merge({
        Effect    = "Allow",
        Principal = "*",
        Action    = "execute-api:Invoke",
        Resource = [
          "execute-api:/*"
        ]
        }, (length(var.private_vpce) > 0) ? {
        Condition = {
          StringEquals = {
            "aws:SourceVpce" = sensitive(var.private_vpce)
          }
        }
      } : {})
    ],
  })
}




