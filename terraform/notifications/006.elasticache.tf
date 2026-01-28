# There's a bug with the terraform provider - updating a tag on the Elasticache user causes timeout
# Striping version tag from this resource avoids frequent updates, if issue is observed again - we may need to exclude tags from this resource
# Closest GH Issue https://github.com/hashicorp/terraform-provider-aws/issues/41962
# Error: Provider produced inconsistent result after apply - When applying changes to aws_elasticache_serverless_cache.this, provider "provider[\"registry.terraform.io/hashicorp/aws\"]" produced an unexpected new value: .status: was cty.StringVal("available"), but now cty.StringVal("modifying"). This is a bug in the provider, which should be reported in the provider's own issue tracker.

# Authenticate using IAM
resource "aws_elasticache_user" "this" {
  user_id       = replace(join("-", [local.prefix, "iam"]), "-", "")
  user_name     = replace(join("-", [local.prefix, "iam"]), "-", "")
  access_string = "on ~* +@all"
  engine        = "valkey"
  authentication_mode {
    type = "iam"
  }

  # Bug workaround, read more at top of the file
  tags = { for k, v in merge(local.defaultTags, {}) : k => v if k != "version" }
}

# Create user group
resource "aws_elasticache_user_group" "this" {
  engine        = "valkey"
  user_group_id = replace(join("-", [local.prefix, "elch", "group"]), "-", "")
  user_ids = [
    aws_elasticache_user.this.user_id
  ]
  tags = merge(local.defaultTags, {})
}

# Create valkey instance
resource "aws_elasticache_serverless_cache" "this" {
  engine      = "valkey"
  name        = join("-", [local.prefix, "elch", "main"])
  description = "Ephemeral key value cache"
  tags        = merge(local.defaultTags, {})

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
  tags = merge(local.defaultTags, {})
}
