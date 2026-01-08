module "lambda_getHealthcheck" {
  source        = "./modules/lambda"
  prefix        = local.prefix
  function_name = "getHealthcheck"
  kms_key_arn   = aws_kms_key.main.arn

  # Using code signing 
  bundle_path            = "../../dist/getHealthcheck"
  s3_bucket_id           = aws_s3_bucket.code_storage.id
  codesigning_config_id  = aws_lambda_code_signing_config.code_signing.id
  codesigning_profile_id = aws_signer_signing_profile.code_signing.id

  trigger_queue_arn = null
}
