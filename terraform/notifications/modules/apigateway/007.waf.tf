resource "aws_wafv2_web_acl" "waf_for_apig" {
  name  = join("-", [var.prefix, "waf", var.name])
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  # Common Rule Set
  # https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html#aws-managed-rule-groups-baseline-crs
  rule {
    name     = "${var.prefix}-aws-common-rule-set"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.prefix}-aws-common-rule-metric"
      sampled_requests_enabled   = true
    }
  }

  # Bad Input Rule Set
  # https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html#aws-managed-rule-groups-baseline-known-bad-inputs
  rule {
    name     = "${var.prefix}-aws-bad-input-rule-set"
    priority = 10
    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.prefix}-aws-bad-input-rule-metric"
      sampled_requests_enabled   = true
    }
  }

  tags = var.tags

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.prefix}-main-metric"
    sampled_requests_enabled   = true
  }
}

# Enable waf logging
resource "aws_wafv2_web_acl_logging_configuration" "waf_logging_config" {
  log_destination_configs = [aws_cloudwatch_log_group.waf_log_group.arn]
  resource_arn            = aws_wafv2_web_acl.waf_for_apig.arn
}

# Associate WAF with APIGateway
resource "aws_wafv2_web_acl_association" "this" {
  resource_arn = aws_api_gateway_stage.this.arn
  web_acl_arn  = aws_wafv2_web_acl.waf_for_apig.arn
}
