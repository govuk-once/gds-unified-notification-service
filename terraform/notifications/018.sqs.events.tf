module "sqs_events" {
  source      = "./modules/sqs"
  queue_name  = "events"
  prefix      = local.prefix
  kms_key_arn = aws_kms_key.main.arn
}
