module "lambda_postMessage" {
  source        = "./modules/lambda"
  prefix        = local.prefix
  region        = var.region
  function_name = "postMessage"
  kms_key_arn   = aws_kms_key.main.arn

  publish_queue_arns = [join("", [module.sqs_processing.queue_arn]), join("", [module.sqs_analytics.queue_arn])]
  dynamo_table_arns  = [join("", [module.dynamodb_inbound_messages.table_arn])]

  # Using code signing 
  bundle_path            = "../../dist/postMessage"
  s3_bucket_id           = aws_s3_bucket.code_storage.id
  codesigning_config_id  = aws_lambda_code_signing_config.code_signing.id
  codesigning_profile_id = aws_signer_signing_profile.code_signing.id
}
