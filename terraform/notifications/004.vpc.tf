# TODO: Implement VPC logging
#tfsec:ignore:aws-ec2-require-vpc-flow-logs-for-all-vpcs
resource "aws_vpc" "main" {
  #checkov:skip=CKV2_AWS_11: "Ensure VPC flow logging is enabled in all VPCs" - TODO / Investigate requirement
  cidr_block = var.cidr_main
  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "vpc", "main"])
  })
  enable_dns_hostnames = true
  enable_dns_support   = true
}

resource "aws_internet_gateway" "main" {
  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "igw", "main"])
  })

  vpc_id = aws_vpc.main.id
}
