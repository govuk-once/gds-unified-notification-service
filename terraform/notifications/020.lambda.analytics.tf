module "lambda_analytics" {
  source        = "./modules/lambda"
  prefix        = local.prefix
  region        = var.region
  function_name = "analytics"

  // TODO: Look into a neater solution that avoids the issue raised in https://github.com/govuk-once/gds-unified-notification-service/pull/32
  trigger_queue_arn = join("", [module.sqs_analytics.queue_arn])
  kms_key_arn       = aws_kms_key.main.arn

  dynamo_table_arns = [join("", [module.dynamodb_events.table_arn])]

  # Using code signing 
  bundle_path            = "../../dist/analytics"
  s3_bucket_id           = aws_s3_bucket.code_storage.id
  codesigning_config_id  = aws_lambda_code_signing_config.code_signing.id
  codesigning_profile_id = aws_signer_signing_profile.code_signing.id

  # TODO: Look into communication issues. Public and private caused timeouts 
  #security_group_ids = [aws_security_group.public_sg.id]
  #subnet_ids         = [for key in toset(local.availability_zones) : aws_subnet.private[key].id]

  additional_policy_arns = {
    # Allow elasticache connection
    elasticache = aws_iam_policy.lambda_elch_policy.arn
  }
}
