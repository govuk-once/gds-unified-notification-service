module "sqs_incomingMessage" {
  source      = "./modules/sqs"
  queue_name  = "incomingMessage"
  prefix      = local.prefix
  kms_key_arn = aws_kms_key.main.arn
}

module "aws_dynamodb_table" {
  source      = "./modules/dynamo"
  hash_key    = "123"
  prefix      = local.prefix
  kms_key_arn = aws_kms_key.main.arn
}
