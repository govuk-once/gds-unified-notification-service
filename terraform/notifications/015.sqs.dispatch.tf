module "sqs_dispatch" {
  source      = "./modules/sqs"
  queue_name  = "dispatch"
  prefix      = local.prefix
  kms_key_arn = aws_kms_key.main.arn
}
