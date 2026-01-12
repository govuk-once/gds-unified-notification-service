module "sqs_incomingMessage" {
  source      = "./modules/sqs"
  queue_name  = "incomingMessage"
  prefix      = local.prefix
  kms_key_arn = aws_kms_key.main.arn
}
