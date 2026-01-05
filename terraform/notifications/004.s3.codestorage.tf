# Storage bucket used to storage signed code bundles

# TODO - Create logging bucket for storing access logs
#tfsec:ignore:aws-s3-enable-bucket-logging
resource "aws_s3_bucket" "code_storage" {
  bucket = join("-", [local.prefix, "s3", "codestorage"])
  tags   = local.defaultTags
}

# Disabling public access
resource "aws_s3_bucket_public_access_block" "code_storage" {
  bucket = aws_s3_bucket.code_storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enabling versioning
resource "aws_s3_bucket_versioning" "code_storage" {
  bucket = aws_s3_bucket.code_storage.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Encryption at rest using KMS key
resource "aws_s3_bucket_server_side_encryption_configuration" "example" {
  bucket = aws_s3_bucket.code_storage.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.main.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled       = true
    blocked_encryption_types = ["SSE-C"]
  }
}

# Codesigning config
resource "aws_signer_signing_profile" "code_signing" {
  platform_id = "AWSLambda-SHA384-ECDSA"

  # invalid value for name (must be alphanumeric with max length of 64 characters)
  name = replace(join("-", [local.prefix, "codesigning"]), "-", "")

  signature_validity_period {
    value = 3
    type  = "MONTHS"
  }
}

resource "aws_lambda_code_signing_config" "code_signing" {
  allowed_publishers {
    signing_profile_version_arns = [aws_signer_signing_profile.code_signing.version_arn]
  }

  policies {
    untrusted_artifact_on_deployment = "Enforce"
  }
}
