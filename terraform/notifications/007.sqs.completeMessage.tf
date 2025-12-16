module "sqs_completeMessage" {
  source      = "./modules/sqs"
  queue_name  = "completeMessage"
  prefix      = local.prefix
  kms_key_arn = aws_kms_key.main.arn
}
