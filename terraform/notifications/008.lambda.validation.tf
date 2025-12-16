module "lambda_validation" {
  source             = "./modules/lambda"
  bundle_path        = "../../artifacts/validation.zip"
  prefix             = local.prefix
  function_name      = "validation"
  trigger_queue_name = "incomingMessage"
  kms_key_arn        = aws_kms_key.main.arn
}
