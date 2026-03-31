# Allow WAF for each apigw resource to write logs to cloudwatch
data "aws_iam_policy_document" "waf_logging" {
  version = "2012-10-17"
  statement {
    effect = "Allow"
    principals {
      identifiers = ["delivery.logs.amazonaws.com"]
      type        = "Service"
    }
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "${module.api_gateway_pso.aws_cloudwatch_log_group_arn}:*",
      "${module.api_gateway_flex.aws_cloudwatch_log_group_arn}:*",
      "${module.api_gateway_flex_private.aws_cloudwatch_log_group_arn}:*"
    ]
  }
}

resource "aws_cloudwatch_log_resource_policy" "waf_cloudwatch_logging" {
  policy_document = data.aws_iam_policy_document.waf_logging.json
  policy_name     = join("-", [local.prefix, "iamrp", "waf-logwrite"])
}
