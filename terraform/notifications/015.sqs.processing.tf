module "sqs_processing" {
  source      = "./modules/sqs"
  queue_name  = "processing"
  prefix      = local.prefix
  kms_key_arn = aws_kms_key.main.arn
}
