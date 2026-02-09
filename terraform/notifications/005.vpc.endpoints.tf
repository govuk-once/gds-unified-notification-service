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
