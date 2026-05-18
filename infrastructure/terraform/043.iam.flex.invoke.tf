# IAM role for Flex to invoke UNS private API gateway

data "aws_iam_policy_document" "flex_invoke_assume_role" {
  count = length(local.flex_account_ids) > 0 ? 1 : 0

  statement {
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = [for id in local.flex_account_ids : "arn:aws:iam::${id}:root"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "flex_invoke" {
  count = length(local.flex_account_ids) > 0 ? 1 : 0

  name               = join("-", [local.prefix, "iamr", "flex-invoke"])
  assume_role_policy = data.aws_iam_policy_document.flex_invoke_assume_role[0].json
  tags               = local.defaultTags
}

data "aws_iam_policy_document" "flex_invoke_policy_document" {
  count = length(local.flex_account_ids) > 0 ? 1 : 0

  statement {
    effect = "Allow"

    actions = [
      "execute-api:Invoke"
    ]

    resources = ["${module.api_gateway_flex_private.rest_api_execution_arn}/*/*"]
  }
}

resource "aws_iam_role_policy" "flex_invoke_policy" {
  count = length(local.flex_account_ids) > 0 ? 1 : 0

  name   = join("-", [local.prefix, "iamp", "flex-invoke"])
  role   = aws_iam_role.flex_invoke[0].id
  policy = data.aws_iam_policy_document.flex_invoke_policy_document[0].json
}
