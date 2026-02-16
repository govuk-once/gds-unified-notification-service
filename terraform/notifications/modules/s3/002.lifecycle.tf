
# Define lifecycle for contents - as these are ephemeral we can delete all artifacts after 30 days
resource "aws_s3_bucket_lifecycle_configuration" "example" {
  bucket = aws_s3_bucket.this.bucket

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
