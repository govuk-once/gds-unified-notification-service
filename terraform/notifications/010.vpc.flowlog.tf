resource "aws_cloudwatch_log_group" "vpc_cloudwatch_group" {
  #checkov:skip=CKV_AWS_338: "Ensure CloudWatch log groups retains logs for at least 1 year" - duration of retentil to be decided
  name = "/aws/vpc/${local.prefix}"

  retention_in_days = 30
  kms_key_id        = aws_kms_key.main.arn
  tags              = local.defaultTags
}

data "aws_iam_policy_document" "vpc_cloudwatch_assume_role" {
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
  name               = join("-", [local.prefix, "iamr", "vpc", "cloudwatch-role"])
  assume_role_policy = data.aws_iam_policy_document.vpc_cloudwatch_assume_role.json
  tags               = local.defaultTags
}

data "aws_iam_policy_document" "vpc_cloudwatch_logging_policy_document" {
  statement {
    effect = "Allow"

    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
    ]

    resources = ["${aws_cloudwatch_log_group.vpc_cloudwatch_group.arn}:*"]
  }
}

resource "aws_iam_role_policy" "vpc_cloudwatch_logging_policy" {
  name   = join("-", [local.prefix, "iamp", "vpc", "cloudwatch-policy"])
  role   = aws_iam_role.vpc_cloudwatch_logging_role.id
  policy = data.aws_iam_policy_document.vpc_cloudwatch_logging_policy_document.json
}

resource "aws_flow_log" "vpc_flow_log" {
  iam_role_arn         = aws_iam_role.vpc_cloudwatch_logging_role.arn
  log_destination      = aws_cloudwatch_log_group.vpc_cloudwatch_group.arn
  log_destination_type = "cloud-watch-logs"
  traffic_type         = "ALL"
  vpc_id               = aws_vpc.main.id
  tags                 = local.defaultTags
}
