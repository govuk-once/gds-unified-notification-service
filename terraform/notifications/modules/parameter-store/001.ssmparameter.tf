// Note: Two resources in this file should have matching configuration - terraform does not allow ignore_changes to be an inferred value which enforces requires this workaround

resource "aws_ssm_parameter" "parameter_with_ignore_value" {
  // Use this resource to create values if we expect manual variable management outside of terraform
  for_each = { for k, v in var.parameters : k => v if var.update_values == false }

  // Metadata
  name  = "/${var.namespace}/${each.key}"
  type  = "SecureString"
  value = sensitive(each.value)

  // Encrypt at rest
  key_id = var.kms_key_arn

  lifecycle {
    ignore_changes = [value]
  }
}
resource "aws_ssm_parameter" "parameter_with_" {
  // Use this resource to create values if we expect terraform to manage the value (same resource as above, without the lifecycle exclusion)
  for_each = { for k, v in var.parameters : k => v if var.update_values == true }

  // Metadata
  name      = "/${var.namespace}/${each.key}"
  type      = "SecureString"
  value     = sensitive(each.value)
  overwrite = true

  // Encrypt at rest
  key_id = var.kms_key_arn
}
