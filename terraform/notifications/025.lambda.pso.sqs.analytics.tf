module "lambda_pso_analytics" {
  source        = "./modules/lambda"
  prefix        = local.prefix
  region        = var.region
  service_name  = "pso"
  function_name = "analytics"

  # Using code signing 
  kms_key_arn            = aws_kms_key.main.arn
  bundle_path            = "../../dist/pso/sqs.analytics"
  s3_bucket_id           = aws_s3_bucket.code_storage.id
  codesigning_config_id  = aws_lambda_code_signing_config.code_signing.id
  codesigning_profile_id = aws_signer_signing_profile.code_signing.id

  # IAM Permissions & SQS trigger linking
  trigger_queues = {
    analytics = module.sqs_analytics.queue_arn
  }
  publish_queues = {}
  dynamo_tables = {
    analytics = module.dynamodb_events.table_arn
  }
  additional_policies = {
    # Allow elasticache connection
    elasticache = aws_iam_policy.lambda_elch_policy.arn
  }

  # Place in private subnet
  security_group_ids = [aws_security_group.public_sg.id]
  subnet_ids         = [for key in toset(local.availability_zones) : aws_subnet.private[key].id]
}
