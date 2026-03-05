# # # resource "aws_api_gateway_authorizer" "this" {
# # #   for_each               = var.authorizers
# # #   name                   = join("-", [var.prefix, "apigwa", each.key])
# # #   rest_api_id            = aws_api_gateway_rest_api.this.id
# # #   authorizer_uri         = each.value.lambda_invoke_arn
# # #   authorizer_credentials = aws_iam_role.apigw_role.arn
# # # }
