# Querying the route53 zone using known name (this has been setup by platform team)
data "aws_route53_zone" "this" {
  count        = var.route_53_zone != null ? 1 : 0
  name         = var.route_53_zone
  private_zone = false
}

# Find it's generated certificate (this has been setup by platform team)
data "aws_acm_certificate" "this" {
  count  = var.route_53_zone != null ? 1 : 0
  domain = data.aws_route53_zone.this[0].name
  # As we cannot use global API Gateway for mTLS - we're switching to regional, and we'll need to use ACM certificates
  region   = var.region
  statuses = ["ISSUED"]
}

# Tell API Gateway about the domain name
resource "aws_api_gateway_domain_name" "this" {
  count       = var.route_53_zone != null ? 1 : 0
  domain_name = "${join("-", [var.prefix, var.name])}.${data.aws_route53_zone.this[0].name}"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  regional_certificate_arn = data.aws_acm_certificate.this[0].arn
  security_policy          = "TLS_1_2"

  # # Link the trustore if one's set in variables of this module
  dynamic "mutual_tls_authentication" {
    for_each = var.mtls_truststore_url != null ? [var.mtls_truststore_url] : []

    content {
      truststore_uri = mutual_tls_authentication.value
    }
  }
}

# Create DNS Record for API Gateway
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
resource "aws_api_gateway_base_path_mapping" "this" {
  count       = var.route_53_zone != null ? 1 : 0
  domain_name = aws_api_gateway_domain_name.this[0].id
  api_id      = aws_api_gateway_rest_api.this.id
  stage_name  = aws_api_gateway_stage.this.stage_name
}
