
module "lambda_getHealthcheck" {
  source        = "./modules/lambda"
  bundle_path   = "../../artifacts/getHealthcheck.zip"
  prefix        = local.prefix
  function_name = "getHealthcheck"
  kms_key_arn   = aws_kms_key.main.arn
}
