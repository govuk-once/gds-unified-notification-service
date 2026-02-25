module "lambda_flex_getNotificationById" {
  source        = "./modules/lambda"
  prefix        = local.prefix
  region        = var.region
  service_name  = "flex"
  function_name = "getNotificationById"

  # Using code signing 
  kms_key_arn            = aws_kms_key.main.arn
  bundle_path            = "../../dist/flex/http.getNotificationById"
  s3_bucket_id           = aws_s3_bucket.code_storage.id
  codesigning_config_id  = aws_lambda_code_signing_config.code_signing.id
  codesigning_profile_id = aws_signer_signing_profile.code_signing.id

  // IAM Permissions & SQS trigger linking
  publish_queues = {}
  dynamo_tables = {
    inbound = module.dynamodb_inbound_messages.table_arn
  }
}
