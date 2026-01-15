# Storage bucket used to storage signed code bundles

# TODO - Create logging bucket for storing access logs
#tfsec:ignore:aws-s3-enable-bucket-logging
resource "aws_s3_bucket" "code_storage" {
  #checkov:skip=CKV_AWS_18: "Ensure the S3 bucket has access logging enabled" - TODO
  #checkov:skip=CKV2_AWS_62: "Ensure S3 buckets should have event notifications enabled" - Not needed
  #checkov:skip=CKV_AWS_144: "Ensure that S3 bucket has cross-region replication enabled" - Not needed, as this is only storing code bundles and not data
  #checkov:skip=CKV2_AWS_61: "Ensure that an S3 bucket has a lifecycle configuration" - Appears to be a known issue - https://github.com/bridgecrewio/checkov/issues/4743 - "aws_s3_bucket_lifecycle_configuration" resource is not being detected
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

# Define lifecycle for contents - as these are ephemeral we can delete all artifacts after 30 days
resource "aws_s3_bucket_lifecycle_configuration" "example" {
  bucket = aws_s3_bucket.code_storage.bucket

  rule {
    id     = "delete-artifacts"
    status = "Enabled"

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    # Auto delete artifacts after 30 days
    expiration {
      days = 30
    }
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
  name = replace(join("-", [local.prefix, "signing_profile_v2"]), "-", "")
  tags = merge(local.defaultTags, {})

  signature_validity_period {
    value = 3
    type  = "MONTHS"
  }


  # Note: TF Appears to not handle deleting / importing these too well
  lifecycle {
    prevent_destroy = true
  }

}

resource "aws_lambda_code_signing_config" "code_signing" {
  tags = merge(local.defaultTags, {})

  allowed_publishers {
    signing_profile_version_arns = [aws_signer_signing_profile.code_signing.version_arn]
  }

  policies {
    untrusted_artifact_on_deployment = "Warn"
  }
}
