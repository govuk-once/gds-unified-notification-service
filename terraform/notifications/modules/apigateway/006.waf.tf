resource "aws_wafv2_web_acl" "this" {
  name        = join("-", [var.prefix, "waf", var.name])
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # Common Rule Set
  # https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html
  rule {
    name     = "AWS-AWSManagedRulesCommonRuleSet"
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
      metric_name                = "CommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  tags = var.tags

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "main-metric-name"
    sampled_requests_enabled   = true
  }
}
