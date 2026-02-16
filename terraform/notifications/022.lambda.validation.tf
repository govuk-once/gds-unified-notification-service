module "lambda_validation" {
  source        = "./modules/lambda"
  prefix        = local.prefix
  region        = var.region
  function_name = "validation"

  # Using code signing 
  kms_key_arn            = aws_kms_key.main.arn
  bundle_path            = "../../dist/validation"
  s3_bucket_id           = module.code_storage.id
  codesigning_config_id  = aws_lambda_code_signing_config.code_signing.id
  codesigning_profile_id = aws_signer_signing_profile.code_signing.id


  // IAM Permissions & SQS trigger linking
  trigger_queues = {
    incoming = module.sqs_incoming.queue_arn
  }
  publish_queues = {
    analytics  = module.sqs_analytics.queue_arn
    processing = module.sqs_processing.queue_arn
  }
  dynamo_tables = {
    inbound = module.dynamodb_inbound_messages.table_arn
  }
  additional_policies = {}
}
