module "lambda_dispatch" {
  source        = "./modules/lambda"
  prefix        = local.prefix
  region        = var.region
  function_name = "dispatch"

  # Using code signing 
  kms_key_arn            = aws_kms_key.main.arn
  bundle_path            = "../../dist/dispatch"
  s3_bucket_id           = module.code_storage.id
  codesigning_config_id  = aws_lambda_code_signing_config.code_signing.id
  codesigning_profile_id = aws_signer_signing_profile.code_signing.id

  // IAM Permissions & trigger linking
  trigger_queues = {
    dispatch = module.sqs_dispatch.queue_arn
  }
  publish_queues = {
    analytics = module.sqs_analytics.queue_arn
  }
  dynamo_tables = {
    inbound = module.dynamodb_inbound_messages.table_arn
  }
  additional_policies = {
    # Allow elasticache connection
    elasticache = aws_iam_policy.lambda_elch_policy.arn
  }

  # Place in private subnet
  security_group_ids = [aws_security_group.private_sg.id]
  subnet_ids         = [for key in toset(local.availability_zones) : aws_subnet.private[key].id]
}
