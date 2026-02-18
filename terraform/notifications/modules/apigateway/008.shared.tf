resource "aws_api_gateway_resource" "shared" {
  for_each = var.shared_path_resources

  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = each.value.parent_id != null ? each.value.parent_id : aws_api_gateway_rest_api.this.root_resource_id
  path_part   = each.value.path_part
}
