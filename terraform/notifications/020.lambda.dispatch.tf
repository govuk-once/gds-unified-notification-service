module "lambda_dispatch" {
  source        = "./modules/lambda"
  prefix        = local.prefix
  region        = var.region
  function_name = "dispatch"

  # Using code signing 
  bundle_path            = "../../dist/dispatch"
  s3_bucket_id           = aws_s3_bucket.code_storage.id
  codesigning_config_id  = aws_lambda_code_signing_config.code_signing.id
  codesigning_profile_id = aws_signer_signing_profile.code_signing.id

  // TODO: Look into a neater solution that avoids the issue raised in https://github.com/govuk-once/gds-unified-notification-service/pull/32
  trigger_queue_arn  = join("", [module.sqs_dispatch.queue_arn])
  publish_queue_arns = [join("", [module.sqs_analytics.queue_arn])]
  dynamo_table_arns  = [join("", [module.dynamodb_inbound_messages.table_arn])]
  kms_key_arn        = aws_kms_key.main.arn

  # Place in private subnet
  security_group_ids = [aws_security_group.private_sg.id]
  subnet_ids         = [for key in toset(local.availability_zones) : aws_subnet.private[key].id]

  # Allow lambda to use iam elasticache user
  additional_policy_arns = {
    # Allow elasticache connection
    elasticache = aws_iam_policy.lambda_elch_policy.arn
  }

}
