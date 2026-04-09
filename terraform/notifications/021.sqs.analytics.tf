module "sqs_analytics" {
  source                   = "./modules/sqs"
  queue_name               = "analytics"
  prefix                   = local.prefix
  kms_key_arn              = aws_kms_key.main.arn
  create_dead_letter_queue = true
}
