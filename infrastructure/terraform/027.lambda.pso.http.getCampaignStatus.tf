module "lambda_pso_getCampaignStatus" {
  source        = "./modules/lambda"
  prefix        = local.prefix
  region        = var.region
  service_name  = "pso"
  function_name = "getCampaignStatus"

  # Using code signing 
  kms_key_arn            = aws_kms_key.main.arn
  bundle_path            = "../../dist/pso/http.getCampaignStatus"
  s3_bucket_id           = aws_s3_bucket.code_storage.id
  codesigning_config_id  = aws_lambda_code_signing_config.code_signing.id
  codesigning_profile_id = aws_signer_signing_profile.code_signing.id

  dynamo_tables = {
    inbound = {
      arn   = module.dynamodb_campaigns.table_arn
      read  = true
      write = false
    }
  }
}
