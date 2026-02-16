# Assuming there's only domain within the account
data "aws_route53_zone" "this" {
  count        = var.route_53_zone != null ? 1 : 0
  name         = var.route_53_zone
  private_zone = false
}

# Find certificate for top level domain
data "aws_acm_certificate" "this" {
  count  = var.route_53_zone != null ? 1 : 0
  domain = data.aws_route53_zone.this[0].name
  # As we cannot use global API Gateway for mTLS - we're switching to regional, and we'll need to use ACM certificates
  region   = var.region
  statuses = ["ISSUED"]
}

# Tell API Gateway about the domain name
moved {
  from = aws_api_gateway_domain_name.this
  to   = aws_api_gateway_domain_name.this[0]
}
resource "aws_api_gateway_domain_name" "this" {
  count       = var.route_53_zone != null ? 1 : 0
  domain_name = "${join("-", [var.prefix, var.name])}.${data.aws_route53_zone.this[0].name}"

  # certificate_arn = data.aws_acm_certificate.this.arn
  endpoint_configuration {
    types = ["REGIONAL"]
  }

  regional_certificate_arn = data.aws_acm_certificate.this[0].arn
  # security_policy          = "SecurityPolicy_TLS13_1_3_2025_09"
  # endpoint_access_mode     = "STRICT"

  # # Link the trustore if one's set in variables of this module
  dynamic "mutual_tls_authentication" {
    for_each = var.mtls_truststore_url != null ? [var.mtls_truststore_url] : []

    content {
      truststore_uri = mutual_tls_authentication.value
    }
  }
}

# Create DNS Record for API Gateway
moved {
  from = aws_route53_record.this
  to   = aws_route53_record.this[0]
}
resource "aws_route53_record" "this" {
  count   = var.route_53_zone != null ? 1 : 0
  name    = aws_api_gateway_domain_name.this[0].domain_name
  type    = "A"
  zone_id = data.aws_route53_zone.this[0].id

  alias {
    evaluate_target_health = true
    name                   = aws_api_gateway_domain_name.this[0].regional_domain_name
    zone_id                = aws_api_gateway_domain_name.this[0].regional_zone_id
  }
}

# Create mapping betwen domain and our API Gateway instance
moved {
  from = aws_api_gateway_base_path_mapping.this
  to   = aws_api_gateway_base_path_mapping.this[0]
}
resource "aws_api_gateway_base_path_mapping" "this" {
  count       = var.route_53_zone != null ? 1 : 0
  domain_name = aws_api_gateway_domain_name.this[0].id
  api_id      = aws_api_gateway_rest_api.this.id
  stage_name  = aws_api_gateway_stage.this.stage_name
}

