module "lambda_processing" {
  source        = "./modules/lambda"
  prefix        = local.prefix
  region        = var.region
  function_name = "processing"

  // TODO: Look into a neater solution that avoids the issue raised in https://github.com/govuk-once/gds-unified-notification-service/pull/32
  trigger_queue_arn  = join("", [module.sqs_validMessage.sqs_queue_arn])
  publish_queue_arns = [join("", [module.sqs_completeMessage.sqs_queue_arn])]
  kms_key_arn        = aws_kms_key.main.arn

  # Using code signing 
  bundle_path            = "../../dist/processing"
  s3_bucket_id           = aws_s3_bucket.code_storage.id
  codesigning_config_id  = aws_lambda_code_signing_config.code_signing.id
  codesigning_profile_id = aws_signer_signing_profile.code_signing_v2.id
}
