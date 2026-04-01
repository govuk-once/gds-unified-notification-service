module "lambda_pso_validation" {
  source        = "./modules/lambda"
  prefix        = local.prefix
  region        = var.region
  service_name  = "pso"
  function_name = "validation"

  # Using code signing 
  kms_key_arn            = aws_kms_key.main.arn
  bundle_path            = "../../dist/pso/sqs.validation"
  s3_bucket_id           = aws_s3_bucket.code_storage.id
  codesigning_config_id  = aws_lambda_code_signing_config.code_signing.id
  codesigning_profile_id = aws_signer_signing_profile.code_signing.id

  dead_letter_queue_arn = module.sqs_incoming.dead_letter_queue_arn

  // IAM Permissions & SQS trigger linking
  trigger_queues = {
    incoming = module.sqs_incoming.queue_arn
  }
  publish_queues = {
    analytics         = module.sqs_analytics.queue_arn
    processing        = module.sqs_processing.queue_arn
    dead_letter_queue = module.sqs_incoming.dead_letter_queue_arn
  }
  dynamo_tables = {
    inbound = {
      arn   = module.dynamodb_inbound_messages.table_arn
      read  = true
      write = true
    }
  }
  additional_policies = {}
}
