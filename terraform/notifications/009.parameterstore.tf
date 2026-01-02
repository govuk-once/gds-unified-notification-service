module "parameter_store" {
  source = "./modules/parameter-store"

  namespace   = local.prefix
  kms_key_arn = aws_kms_key.main.arn

  parameters = {
    "example"  = "test"
  }
}
