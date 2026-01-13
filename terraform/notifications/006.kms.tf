resource "aws_kms_key" "main" {
  description             = join("-", [local.prefix, "kms", "key"])
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.aws.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow lambdas"
        Effect = "Allow",
        Principal = {
          Service = "lambda.amazonaws.com"
        },
        Action = [
          "kms:GenerateDataKey",
          "kms:Decrypt"
        ],
        Resource = "*"
        Condition = {
          StringLike = {
            "kms:EncryptionContext:aws:lambda:FunctionArn" : "arn:aws:lambda:${var.region}:${data.aws_caller_identity.aws.account_id}:function:*"
          }
        }
      },
      {
        Sid    = "Allow Cloudwatch Logs within account and region"
        Effect = "Allow"
        Principal = {
          Service = "logs.${var.region}.amazonaws.com"
        }
        Action = [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*"
        ]
        Resource = "*"
        Condition = {
          ArnLike = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${var.region}:${data.aws_caller_identity.aws.account_id}:*"
          }
        }
      }
    ]
  })
}

resource "aws_kms_alias" "main" {
  name          = replace(join("/", ["alias", local.prefix, "kms", "key"]), "-", "/")
  target_key_id = aws_kms_key.main.key_id
}
