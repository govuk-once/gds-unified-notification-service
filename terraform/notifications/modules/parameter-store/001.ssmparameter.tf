resource "aws_ssm_parameter" "secret" {
  // Metadata
  name        = "/${var.namespace}/${var.value}"
  description = var.description
  tags        = var.tags
  type        = "SecureString"
  value       = var.value

  // Validation
  allowed_pattern = var.allowed_pattern

  // Encrypt at rest
  key_id = var.kms_key_arn

  // Lifecycle
  lifecycle {
    ignore_changes = [value, tags]
  }
}

