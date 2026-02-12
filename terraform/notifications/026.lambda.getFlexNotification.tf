module "lambda_getFlexNotification" {
  source        = "./modules/lambda"
  prefix        = local.prefix
  region        = var.region
  function_name = "getFlexNotification"

  # Using code signing 
  kms_key_arn            = aws_kms_key.main.arn
  bundle_path            = "../../dist/getFlexNotification"
  s3_bucket_id           = aws_s3_bucket.code_storage.id
  codesigning_config_id  = aws_lambda_code_signing_config.code_signing.id
  codesigning_profile_id = aws_signer_signing_profile.code_signing.id

  // IAM Permissions & SQS trigger linking
  trigger_queues = {}
  publish_queues = {
    analytics  = module.sqs_analytics.queue_arn
    processing = module.sqs_processing.queue_arn
  }
  additional_policies = {}

}
