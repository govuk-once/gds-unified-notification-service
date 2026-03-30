module "lambda_pso_processing" {
  source        = "./modules/lambda"
  prefix        = local.prefix
  region        = var.region
  service_name  = "pso"
  function_name = "processing"

  # Using code signing 
  kms_key_arn            = aws_kms_key.main.arn
  bundle_path            = "../../dist/pso/sqs.processing"
  s3_bucket_id           = aws_s3_bucket.code_storage.id
  codesigning_config_id  = aws_lambda_code_signing_config.code_signing.id
  codesigning_profile_id = aws_signer_signing_profile.code_signing.id

  dead_letter_queue_arn = module.sqs_processing.dead_letter_queue_arn

  // IAM Permissions & SQS trigger linking
  trigger_queues = {
    processing = module.sqs_processing.queue_arn
  }

  publish_queues = {
    analytics         = module.sqs_analytics.queue_arn
    dispatch          = module.sqs_dispatch.queue_arn
    dead_letter_queue = module.sqs_processing.dead_letter_queue_arn
  }

  dynamo_tables = {
    inbound = {
      arn   = module.dynamodb_inbound_messages.table_arn
      read  = true
      write = true
    }
  }

  # Place in private subnet
  security_group_ids = [aws_security_group.private_sg.id]
  subnet_ids         = [for key in toset(local.availability_zones) : aws_subnet.private[key].id]
}
