module "sqs_validateMessage" {
  source      = "./modules/sqs"
  queue_name  = "validateMessage"
  prefix      = local.prefix
  kms_key_arn = aws_kms_key.main.arn
}
