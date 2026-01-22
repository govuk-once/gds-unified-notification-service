
# Subnet config
locals {
  // Subnets start at 10.0.2.0, 10.0.3.0, 10.0.4.0 .... etc
  public_subnets_cidrs = [
    for zone in toset(local.availability_zones) : cidrsubnet(var.cidr_main, 7, index(local.availability_zones, zone))
  ]
  private_subnets_cidrs = [
    for zone in toset(local.availability_zones) : cidrsubnet(var.cidr_main, 7, 1 + length(local.availability_zones) + index(local.availability_zones, zone))
  ]
}

// Establishing VPC
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

// Ensure default security group has no rules
resource "aws_default_security_group" "default" {
  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "default", "sg"])
  })

  vpc_id = aws_vpc.main.id
}

resource "aws_internet_gateway" "main" {
  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "igw", "main"])
  })

  vpc_id = aws_vpc.main.id
}

# Setting up route tables
resource "aws_route_table" "public" {
  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "public", "rt"])
  })

  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}

resource "aws_route_table" "private" {
  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "private", "rt"])
  })

  vpc_id = aws_vpc.main.id
}

// Public subnet for each availability zone
resource "aws_subnet" "public" {
  for_each = toset(local.availability_zones)

  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "public", substr(each.key, -2, 2)])
  })

  vpc_id            = aws_vpc.main.id
  availability_zone = each.key
  cidr_block        = local.public_subnets_cidrs[index(local.availability_zones, each.key)]
}

// Private subnet for each availability zone
resource "aws_subnet" "private" {
  for_each = toset(local.availability_zones)

  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "private", substr(each.key, -2, 2)])
  })

  vpc_id            = aws_vpc.main.id
  availability_zone = each.key
  cidr_block        = local.private_subnets_cidrs[index(local.availability_zones, each.key)]
}

// Public inbound / outbound rules in security group
resource "aws_security_group" "public_sg" {
  name        = join("-", [local.prefix, "sg", "pub"])
  description = "Security group which allows access to public egress"
  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "sgpub"])
  })

  vpc_id = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "public_sg_allow_all_vnet_ingress" {
  description = "Allow all traffic from within VPC"
  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "allow-vnet-ingress"])
  })

  security_group_id = aws_security_group.public_sg.id
  cidr_ipv4         = aws_vpc.main.cidr_block
  ip_protocol       = "-1"
}

resource "aws_vpc_security_group_egress_rule" "allow_all_egress" {
  description = "Allow all services to go outside of VPC"
  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "allow-all-egress"])
  })

  security_group_id = aws_security_group.public_sg.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

// Allow public subnets to reach internet
resource "aws_route_table_association" "public" {
  for_each       = toset(local.availability_zones)
  subnet_id      = aws_subnet.public[each.key].id
  route_table_id = aws_route_table.public.id
}

// Private network
resource "aws_security_group" "private_sg" {
  name        = join("-", [local.prefix, "sg", "priv"])
  description = "Security group which prevents access to public egress"
  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "sgpriv"])
  })

  vpc_id = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "private_sg_allow_all_vnet_ingress" {
  description = "Allow all traffic from within VPC"
  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "allow-vnet-ingress"])
  })

  security_group_id = aws_security_group.private_sg.id
  cidr_ipv4         = aws_vpc.main.cidr_block
  ip_protocol       = "-1"
}

resource "aws_route_table_association" "private" {
  for_each       = toset(local.availability_zones)
  subnet_id      = aws_subnet.private[each.key].id
  route_table_id = aws_route_table.private.id
}

# VPC Endpoints
resource "aws_vpc_endpoint" "vpc_endpoints" {
  for_each = toset([
    # service names follows: com.amazonaws.{region}.{name} pattern
    "apigateway",
    "applicationinsights",
    # "dynamodb" // TODO: Investigate - Private DNS can't be enabled because the service com.amazonaws.eu-west-2.dynamodb does not provide a private DNS name.
    "elasticache",
    "kms",
    "lambda",
    "logs",
    "monitoring",
    "network-firewall",
    "route53resolver",
    // "s3" // TODO: Investigate -  'To set PrivateDnsOnlyForInboundResolverEndpoint to true, the VPC vpc-** must have a Gateway endpoint for the service.'
    "secretsmanager",
    "sqs",
    "ssm",
    "xray"
  ])

  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.${each.value}"
  vpc_endpoint_type = "Interface"

  security_group_ids = [
    aws_security_group.private_sg.id,
  ]

  subnet_ids = concat([
    for key in toset(local.availability_zones) : aws_subnet.private[key].id
  ])

  // Private DNS can't be enabled because the service com.amazonaws.eu-west-2.dynamodb does not provide a private DNS name.
  private_dns_enabled = each.value == "dynamodb" ? false : true

  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "endpoint", each.value])
  })
}
