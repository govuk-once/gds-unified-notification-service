module "parameter_store" {
  source = "./modules/parameter-store"

  namespace   = local.prefix
  kms_key_arn = aws_kms_key.main.arn

  parameters = {
    "/config/common/enabled" = "true"
    "/config/ingest/enabled" = "true"
    "/config/process/enabled" = "true"
    "/config/dispatch/enabled" = "true"
    "/config/dispatch/onetrust/apikey" = "placeholder"
  }
}
