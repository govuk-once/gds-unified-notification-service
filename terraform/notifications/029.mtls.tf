# Create certificates signed by the private CA
resource "tls_private_key" "key" {
  algorithm = "RSA"

}

resource "tls_cert_request" "csr" {
  private_key_pem = tls_private_key.key.private_key_pem

  subject {
    common_name = "pso1.${var.account_domain}"
  }
}

# Sign the cert request with the Private CA
resource "aws_acmpca_certificate" "e2e" {
  certificate_authority_arn   = aws_acmpca_certificate_authority.this.arn
  certificate_signing_request = tls_cert_request.csr.cert_request_pem
  signing_algorithm           = "SHA256WITHRSA"
  validity {
    type  = "DAYS"
    value = 1
  }
}

# Private key
resource "aws_s3_object" "e2e_pem" {
  tags = merge(local.defaultTags, {})

  bucket     = module.certificatestorage.bucket
  key        = "e2e.pem"
  kms_key_id = aws_kms_key.main.arn
  content    = sensitive(tls_private_key.key.private_key_pem)
}

# Signed certificate
resource "aws_s3_object" "e2e_crt" {
  tags = merge(local.defaultTags, {})

  bucket     = module.certificatestorage.bucket
  key        = "e2e.crt"
  kms_key_id = aws_kms_key.main.arn
  content    = sensitive(aws_acmpca_certificate.e2e.certificate)
}
