data "aws_partition" "current" {}

# Certificate storage
module "certificatestorage" {
  source      = "./modules/s3"
  prefix      = local.prefix
  name        = "certificatestorage"
  kms_key_arn = aws_kms_key.main.arn
}

# Create Certificate Authority
resource "aws_acmpca_certificate_authority" "this" {
  tags       = merge(local.defaultTags, {})
  usage_mode = "SHORT_LIVED_CERTIFICATE"
  type       = "ROOT"

  certificate_authority_configuration {
    key_algorithm     = "RSA_4096"
    signing_algorithm = "SHA512WITHRSA"

    subject {
      common_name = var.account_domain
    }
  }
}

# Create a root ceritficate
resource "aws_acmpca_certificate" "this" {
  certificate_authority_arn   = aws_acmpca_certificate_authority.this.arn
  certificate_signing_request = aws_acmpca_certificate_authority.this.certificate_signing_request
  signing_algorithm           = "SHA512WITHRSA"

  template_arn = "arn:${data.aws_partition.current.partition}:acm-pca:::template/RootCACertificate/V1"

  validity {
    type  = "DAYS"
    value = 7
  }
}

# Link certificate - note: Root certificate is able to self-sign in this case
resource "aws_acmpca_certificate_authority_certificate" "this" {
  certificate_authority_arn = aws_acmpca_certificate_authority.this.arn
  certificate               = aws_acmpca_certificate.this.certificate
  certificate_chain         = aws_acmpca_certificate.this.certificate_chain
}

# Store truststore pem
resource "aws_s3_object" "truststore" {
  tags = merge(local.defaultTags, {})

  bucket     = module.certificatestorage.bucket
  key        = "truststore.pem"
  kms_key_id = aws_kms_key.main.arn
  content    = sensitive(aws_acmpca_certificate.this.certificate)
}
