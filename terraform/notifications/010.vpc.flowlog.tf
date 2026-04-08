# Creates a log group to capture the IP traffic
resource "aws_cloudwatch_log_group" "vpc_cloudwatch_group" {
  #checkov:skip=CKV_AWS_338: "Ensure CloudWatch log groups retains logs for at least 1 year" - duration of retentil to be decided
  count = var.is_main_environment_in_account ? 1 : 0

  name              = "/aws/vpc/${local.prefix}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.main.arn
  tags              = local.defaultTags
}

data "aws_iam_policy_document" "vpc_cloudwatch_assume_role" {
  count = var.is_main_environment_in_account ? 1 : 0

  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "vpc_cloudwatch_logging_role" {
  count = var.is_main_environment_in_account ? 1 : 0

  name               = join("-", [local.prefix, "iamr", "vpc", "cloudwatch-role"])
  assume_role_policy = data.aws_iam_policy_document.vpc_cloudwatch_assume_role[0].json
  tags               = local.defaultTags
}

# Gives iam permission to add and update logs
data "aws_iam_policy_document" "vpc_cloudwatch_logging_policy_document" {
  count = var.is_main_environment_in_account ? 1 : 0

  statement {
    effect = "Allow"

    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
    ]

    resources = [aws_cloudwatch_log_group.vpc_cloudwatch_group[0].arn]
  }
}

resource "aws_iam_role_policy" "vpc_cloudwatch_logging_policy" {
  count = var.is_main_environment_in_account ? 1 : 0

  name   = join("-", [local.prefix, "iamp", "vpc", "cloudwatch-policy"])
  role   = aws_iam_role.vpc_cloudwatch_logging_role[0].id
  policy = data.aws_iam_policy_document.vpc_cloudwatch_logging_policy_document[0].json
}

# Setups a flow logs to log the vpc to cloudwatch
resource "aws_flow_log" "vpc_flow_log" {
  count = var.is_main_environment_in_account ? 1 : 0

  iam_role_arn         = aws_iam_role.vpc_cloudwatch_logging_role[0].arn
  log_destination      = aws_cloudwatch_log_group.vpc_cloudwatch_group[0].arn
  log_destination_type = "cloud-watch-logs"
  traffic_type         = "ALL"
  vpc_id               = aws_vpc.main.id
  tags                 = local.defaultTags
}
