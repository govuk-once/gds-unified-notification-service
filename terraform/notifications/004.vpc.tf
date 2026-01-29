// TODO: Split this file into smaller subsections, vpc, subnets, routes, security groups, private links - potentially offload it all into module
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

resource "aws_eip" "main" {
  for_each = toset(local.availability_zones)
  domain   = "vpc"

  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "eip", "main", each.key])
  })
}

resource "aws_nat_gateway" "public" {
  for_each = toset(local.availability_zones)

  allocation_id = aws_eip.main[each.key].id
  subnet_id     = aws_subnet.public[each.key].id

  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "ng", "main"])
  })

  # To ensure proper ordering, it is recommended to add an explicit dependency
  # on the Internet Gateway for the VPC.
  depends_on = [aws_internet_gateway.main]
}

# Setting up route tables
resource "aws_route_table" "public" {
  for_each = toset(local.availability_zones)
  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "public", "rt", each.key])
  })

  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}

resource "aws_route_table" "private" {
  for_each = toset(local.availability_zones)

  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "private", "rt", each.key])
  })

  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.public[each.key].id
  }
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
  route_table_id = aws_route_table.public[each.key].id
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

resource "aws_vpc_security_group_egress_rule" "allow_all_egress_to_internet" {
  description = "Allow all services to go outside of VPC"
  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "allow-all-egress"])
  })

  security_group_id = aws_security_group.private_sg.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_route_table_association" "private" {
  for_each       = toset(local.availability_zones)
  subnet_id      = aws_subnet.private[each.key].id
  route_table_id = aws_route_table.private[each.key].id
}

# VPC Endpoint Interfaces
resource "aws_vpc_endpoint" "vpc_endpoints_interfaces" {
  for_each = toset([
    # service names follow: com.amazonaws.{region}.{name} pattern
    "apigateway",
    "applicationinsights",
    # "elasticache", Elasticache integrates directly into subnets - and we do not interact with resource managing APIs
    "kms",
    "lambda",
    "logs",
    "monitoring",
    "network-firewall",
    "route53resolver",
    "secretsmanager",
    "sqs",
    "ssm",
    "xray"
  ])

  region            = var.region
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.${each.value}"
  vpc_endpoint_type = "Interface"
  security_group_ids = [
    aws_security_group.private_sg.id,
  ]

  subnet_ids = concat([
    for key in toset(local.availability_zones) : aws_subnet.private[key].id
  ])

  private_dns_enabled = true

  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "endpoint", each.value])
  })
}

# VPC Endpoint Gateways
resource "aws_vpc_endpoint" "vpc_endpoints_gateways" {
  for_each = toset([
    # service names follow: com.amazonaws.{region}.{name} pattern
    "dynamodb",
    // "s3" // TODO: Investigate -  'To set PrivateDnsOnlyForInboundResolverEndpoint to true, the VPC vpc-** must have a Gateway endpoint for the service.'
  ])

  region            = var.region
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.${each.value}"
  vpc_endpoint_type = "Gateway"
  route_table_ids = [
    for key in toset(local.availability_zones) : aws_route_table.private[key].id
  ]

  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "endpoint", each.value])
  })
}
