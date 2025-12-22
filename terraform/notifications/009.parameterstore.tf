module "temp" {
  source = "./modules/parameter-store"

  namespace   = local.prefix
  value       = "temp"
  description = "Temporary secret to test out the deployment"
  kms_key_arn = aws_kms_key.main.arn
}
