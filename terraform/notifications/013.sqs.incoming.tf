module "sqs_incoming" {
  source      = "./modules/sqs"
  queue_name  = "incoming"
  prefix      = local.prefix
  kms_key_arn = aws_kms_key.main.arn
}
