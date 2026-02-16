# Storage bucket used to storage signed code bundles
moved {
  from = aws_s3_bucket.code_storage
  to   = module.code_storage.aws_s3_bucket.this
}
module "code_storage" {
  source      = "./modules/s3"
  prefix      = local.prefix
  name        = "codestorage"
  kms_key_arn = aws_kms_key.main.arn
}

# Codesigning config
resource "aws_signer_signing_profile" "code_signing" {
  platform_id = "AWSLambda-SHA384-ECDSA"

  # invalid value for name (must be alphanumeric with max length of 64 characters)
  name = replace(join("-", [local.prefix, "signing_profile_v8"]), "-", "")
  tags = merge(local.defaultTags, {})

  signature_validity_period {
    value = 3
    type  = "MONTHS"
  }


  # Note: TF Appears to not handle deleting / importing these too well
  lifecycle {
    # prevent_destroy = true
    ignore_changes = [name]
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
