# Create dedicated log group
resource "aws_cloudwatch_log_group" "this" {
  #checkov:skip=CKV_AWS_338: "Ensure CloudWatch log groups retains logs for at least 1 year" - duration of retentil to be decided

  name              = "/aws/apigw/${aws_api_gateway_rest_api.this.name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

# Create dedicated log group for WAF
resource "aws_cloudwatch_log_group" "waf_log_group" {
  name              = "aws-waf-logs-${var.prefix}-${var.name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

# Allow WAF to write logs to cloudwatch
resource "aws_cloudwatch_log_resource_policy" "waf_cloudwatch_logging" {
  policy_document = data.aws_iam_policy_document.waf_logging.json
  policy_name     = join("-", [var.prefix, "iamrp", var.name, "waf-logwrite"])
}

data "aws_iam_policy_document" "waf_logging" {
  version = "2012-10-17"
  statement {
    effect = "Allow"
    principals {
      identifiers = ["delivery.logs.amazonaws.com"]
      type        = "Service"
    }
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.this.arn}:*"]
    condition {
      test     = "ArnLike"
      values   = ["arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:*"]
      variable = "aws:SourceArn"
    }
    condition {
      test     = "StringEquals"
      values   = [tostring(data.aws_caller_identity.current.account_id)]
      variable = "aws:SourceAccount"
    }
  }
}
