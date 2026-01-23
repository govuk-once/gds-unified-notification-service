
#tfsec:ignore:aws-s3-enable-bucket-logging
resource "aws_s3_bucket" "cloudtrail" {
  #checkov:skip=CKV_AWS_18: "Ensure the S3 bucket has access logging enabled" - TODO
  #checkov:skip=CKV2_AWS_62: "Ensure S3 buckets should have event notifications enabled" - Not needed
  #checkov:skip=CKV_AWS_144: "Ensure that S3 bucket has cross-region replication enabled" - Not needed, as this is only storing code bundles and not data
  #checkov:skip=CKV2_AWS_61: "Ensure that an S3 bucket has a lifecycle configuration" - Appears to be a known issue - https://github.com/bridgecrewio/checkov/issues/4743 - "aws_s3_bucket_lifecycle_configuration" resource is not being detected
  bucket = join("-", [local.prefix, "s3", "cloudtrail"])
  tags   = local.defaultTags
}

resource "aws_s3_bucket_versioning" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.main.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled       = true
    blocked_encryption_types = ["SSE-C"]
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Policies based on AWS Recommendations: https://docs.aws.amazon.com/awscloudtrail/latest/userguide/create-s3-bucket-policy-for-cloudtrail.html
resource "aws_s3_bucket_policy" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id
  policy = jsonencode({
    "Version" : "2012-10-17",
    "Statement" : [
      {
        "Sid" : "AWSCloudTrailAclCheck20150319",
        "Effect" : "Allow",
        "Principal" : { "Service" : "cloudtrail.amazonaws.com" },
        "Action" : "s3:GetBucketAcl",
        "Resource" : "arn:aws:s3:::${aws_s3_bucket.cloudtrail.bucket}",
        "Condition" : {
          "StringEquals" : {
            "aws:SourceArn" : "arn:aws:cloudtrail:${var.region}:${data.aws_caller_identity.aws.account_id}:trail/${join("-", [local.prefix, "cloudtrail"])}"
          }
        }
      },
      {
        "Sid" : "AWSCloudTrailWrite20150319",
        "Effect" : "Allow",
        "Principal" : { "Service" : "cloudtrail.amazonaws.com" },
        "Action" : "s3:PutObject",
        "Resource" : "arn:aws:s3:::${aws_s3_bucket.cloudtrail.bucket}/AWSLogs/${data.aws_caller_identity.aws.account_id}/*",
        "Condition" : {
          "StringEquals" : {
            "s3:x-amz-acl" : "bucket-owner-full-control",
            "aws:SourceArn" : "arn:aws:cloudtrail:${var.region}:${data.aws_caller_identity.aws.account_id}:trail/${join("-", [local.prefix, "cloudtrail"])}"
          }
        }
      }
    ]
  })
}

#tfsec:ignore:aws-cloudtrail-ensure-cloudwatch-integration
resource "aws_cloudtrail" "cloudtrail" {
  #checkov:skip=CKV_AWS_252: "Ensure CloudTrail defines an SNS Topic" - Investigate whether it's necessary
  #checkov:skip=CKV2_AWS_10: "Ensure CloudTrail trails are integrated with CloudWatch Logs" - Investigate whether it's necessary along with s3
  depends_on = [
    aws_kms_key.main,
    aws_s3_bucket.cloudtrail,
    aws_s3_bucket_policy.cloudtrail
  ]

  name                          = join("-", [local.prefix, "cloudtrail"])
  tags                          = local.defaultTags
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true
  enable_log_file_validation    = true
  # kms_key_id                    = aws_kms_key.main.arn
  # is_multi_region_trail         = true
}
