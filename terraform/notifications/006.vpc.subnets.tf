locals {
  // Subnets start at 10.0.2.0, 10.0.3.0, 10.0.4.0 .... etc
  public_subnets_cidrs = [
    for zone in toset(local.availability_zones) : cidrsubnet(var.cidr_main, 7, index(local.availability_zones, zone))
  ]
  private_subnets_cidrs = [
    for zone in toset(local.availability_zones) : cidrsubnet(var.cidr_main, 7, 1 + length(local.availability_zones) + index(local.availability_zones, zone))
  ]
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
