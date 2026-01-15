# This fetches the AWS Account ID, User ID, and ARN of the current credentials
data "aws_caller_identity" "current" {}
