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
