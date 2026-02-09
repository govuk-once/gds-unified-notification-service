
# Gateway role assumption
data "aws_iam_policy_document" "assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["apigateway.amazonaws.com", "lambda.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "apigw_role" {
  name               = join("-", [var.prefix, "iamr", "apigw", var.name])
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

// Allow usage of lambdas
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.apigw_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

// Allow pushing to cloudwatch logs
resource "aws_iam_role_policy_attachment" "cloudwatch_basic" {
  role       = aws_iam_role.apigw_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

resource "aws_api_gateway_account" "apigw" {
  cloudwatch_role_arn = aws_iam_role.apigw_role.arn
}

