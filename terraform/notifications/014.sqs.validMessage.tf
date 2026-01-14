module "sqs_validMessage" {
  source      = "./modules/sqs"
  queue_name  = "validMessage"
  prefix      = local.prefix
  kms_key_arn = aws_kms_key.main.arn
}
