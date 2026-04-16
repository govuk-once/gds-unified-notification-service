locals {
  custom_domain_setup = var.route_53_zone != null && length(var.private_vpce) == 0
}

# Querying the route53 zone using known name (this has been setup by platform team)
data "aws_route53_zone" "this" {
  count        = local.custom_domain_setup ? 1 : 0
  name         = var.route_53_zone
  private_zone = false
}

# Find it's generated certificate (this has been setup by platform team)
data "aws_acm_certificate" "this" {
  count  = local.custom_domain_setup ? 1 : 0
  domain = data.aws_route53_zone.this[0].name
  # As we cannot use global API Gateway for mTLS - we're switching to regional, and we'll need to use ACM certificates
  region   = var.region
  statuses = ["ISSUED"]
}

# Tell API Gateway about the domain name
resource "aws_api_gateway_domain_name" "this" {
  depends_on = [
    aws_api_gateway_rest_api.this,
    aws_api_gateway_stage.this,
    aws_api_gateway_deployment.this
  ]

  count       = local.custom_domain_setup ? 1 : 0
  domain_name = var.is_main_environment_in_account ? "${var.name}.${data.aws_route53_zone.this[0].name}" : "${join("-", [var.prefix, var.name])}.${data.aws_route53_zone.this[0].name}"

  // If we're using mTLS - set endpoint type to REGIONAL, otherwise set the private APIs 
  dynamic "endpoint_configuration" {
    for_each = var.mtls_truststore_url != null || length(var.private_vpce) == 0 ? [true] : []

    content {
      types = ["REGIONAL"]
    }
  }

  // If we're not using mTLS AND have `private_vpce` available - set API definition to private
  dynamic "endpoint_configuration" {
    for_each = var.mtls_truststore_url == null && length(var.private_vpce) > 0 ? [true] : []

    content {
      types           = ["PRIVATE"]
      ip_address_type = "dualstack"
    }
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
  count   = local.custom_domain_setup ? 1 : 0
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
  count       = local.custom_domain_setup ? 1 : 0
  domain_name = aws_api_gateway_domain_name.this[0].id
  api_id      = aws_api_gateway_rest_api.this.id
  stage_name  = aws_api_gateway_stage.this.stage_name
}
