resource "aws_xray_sampling_rule" "this" {
  rule_name      = join("-", [var.prefix, "xsr", var.rule_name])
  priority       = var.priority
  version        = 1
  reservoir_size = var.reservoir
  fixed_rate     = var.fixed_rate
  url_path       = "*"
  host           = "*"
  http_method    = "*"
  service_type   = "*"
  service_name   = "*"
  resource_arn   = "*"

  attributes = var.attributes
}
