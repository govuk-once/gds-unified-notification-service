// Ensure default security group has no rules
resource "aws_default_security_group" "default" {
  tags = merge(local.defaultTags, {
    Name = join("-", [local.prefix, "default", "sg"])
  })

  vpc_id = aws_vpc.main.id
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
