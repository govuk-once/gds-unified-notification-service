# Storage bucket used to storage signed code bundles

# TODO - Create logging bucket for storing access logs
#tfsec:ignore:aws-s3-enable-bucket-logging
resource "aws_s3_bucket" "this" {
  #checkov:skip=CKV_AWS_18: "Ensure the S3 bucket has access logging enabled" - TODO
  #checkov:skip=CKV2_AWS_62: "Ensure S3 buckets should have event notifications enabled" - Not needed
  #checkov:skip=CKV_AWS_144: "Ensure that S3 bucket has cross-region replication enabled" - Not needed, as this is only storing code bundles and not data
  #checkov:skip=CKV2_AWS_61: "Ensure that an S3 bucket has a lifecycle configuration" - Appears to be a known issue - https://github.com/bridgecrewio/checkov/issues/4743 - "aws_s3_bucket_lifecycle_configuration" resource is not being detected
  bucket = join("-", [var.prefix, "s3", var.name])
  tags   = var.tags
}

# Disabling public access
resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enabling versioning
resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id
  versioning_configuration {
    status = "Enabled"
  }
}
