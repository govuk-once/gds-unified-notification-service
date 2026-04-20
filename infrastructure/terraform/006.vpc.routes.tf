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

// Allow public subnets to reach internet
resource "aws_route_table_association" "public" {
  for_each       = toset(local.availability_zones)
  subnet_id      = aws_subnet.public[each.key].id
  route_table_id = aws_route_table.public[each.key].id
}

resource "aws_route_table_association" "private" {
  for_each       = toset(local.availability_zones)
  subnet_id      = aws_subnet.private[each.key].id
  route_table_id = aws_route_table.private[each.key].id
}
