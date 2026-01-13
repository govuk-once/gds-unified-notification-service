# Authenticate using IAM
resource "aws_elasticache_user" "this" {
  user_id       = replace(join("-", [local.prefix, "iam"]), "-", "")
  user_name     = replace(join("-", [local.prefix, "iam"]), "-", "")
  access_string = "on ~* +@all"
  engine        = "valkey"
  authentication_mode {
    type = "iam"
  }
}

# Create user group
resource "aws_elasticache_user_group" "this" {
  engine        = "valkey"
  user_group_id = "group"
  user_ids = [
    aws_elasticache_user.this.user_id
  ]
}

# Create valkey instance
resource "aws_elasticache_serverless_cache" "this" {
  engine      = "valkey"
  name        = join("-", [local.prefix, "elch", "main"])
  description = "Ephemeral key value cache"
  tags        = local.defaultTags

  # Instance config
  major_engine_version = "8"
  cache_usage_limits {
    data_storage {
      maximum = 10
      unit    = "GB"
    }
    ecpu_per_second {
      # Range is between 1000 & 15mil, for PoC we can stick to lower range
      maximum = 5000
    }
  }

  # Encryption at rest
  kms_key_id = aws_kms_key.main.arn

  # Snapshot configuration
  daily_snapshot_time      = "04:00"
  snapshot_retention_limit = 1

  # Add user groups
  user_group_id = aws_elasticache_user_group.this.id

  # Place in VPC
  security_group_ids = [aws_security_group.private_sg.id]
  subnet_ids         = [for key in toset(local.availability_zones) : aws_subnet.private[key].id]
}

# Create policy for lambdas to use
resource "aws_iam_policy" "lambda_elch_policy" {
  name = join("-", [local.prefix, "iamp", "elch_policy"])
  policy = jsonencode(
    {
      Statement = [
        {
          Action = "elasticache:Connect"
          Effect = "Allow"
          Resource = [
            aws_elasticache_serverless_cache.this.arn,
            aws_elasticache_user.this.arn,
          ]
        },
      ]
      Version = "2012-10-17"
    }
  )
}
