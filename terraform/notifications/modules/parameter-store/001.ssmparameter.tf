resource "aws_ssm_parameter" "this" {
  for_each = var.parameters

  // Metadata
  name  = "/${var.namespace}/${each.key}"
  type  = "SecureString"
  value = sensitive(each.value)

  // Encrypt at rest
  key_id = var.kms_key_arn

  lifecycle {
    ignore_changes = [
      value,
    ]
  }
}
