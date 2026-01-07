# 
locals {
  bundle_filename = replace(":", "", "${var.function_name}.${timestamp()}.zip")
}

# Zip file
data "archive_file" "bundle_zip" {
  type        = "zip"
  source_dir  = var.bundle_path
  output_path = "../../dist/${local.bundle_filename}.zip"
}

# Upload signed bundle using KMS key
resource "aws_s3_object" "unsigned_bundle" {
  bucket     = var.s3_bucket_id
  key        = local.bundle_filename
  source     = data.archive_file.bundle_zip.output_path
  kms_key_id = var.kms_key_arn
}

# Explicitly run signing job
resource "aws_signer_signing_job" "code_signing" {
  profile_name = var.codesigning_profile_id

  source {
    s3 {
      bucket  = var.s3_bucket_id
      key     = aws_s3_object.unsigned_bundle.key
      version = aws_s3_object.unsigned_bundle.version_id
    }
  }

  destination {
    s3 {
      bucket = var.s3_bucket_id
      prefix = "signed/"
    }
  }

  // Failure of signing - stop the process
  ignore_signing_job_failure = false
}
