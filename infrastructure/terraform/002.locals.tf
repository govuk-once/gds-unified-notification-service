locals {
  project = "gdsuns"
  prefix  = "${local.project}-${var.env}"
  defaultTags = {
    project   = "UNS"
    env       = var.env
    managedBy = "Terraform"
    version   = var.code_version
  }

  availability_zones = [for zone in split(",", var.availability_zones) : "${var.region}${zone}"]
}

locals {
  // Subnets start at 10.0.2.0, 10.0.3.0, 10.0.4.0 .... etc
  public_subnets_cidrs = [
    for zone in toset(local.availability_zones) : cidrsubnet(var.cidr_main, 7, index(local.availability_zones, zone))
  ]
  private_subnets_cidrs = [
    for zone in toset(local.availability_zones) : cidrsubnet(var.cidr_main, 7, 1 + length(local.availability_zones) + index(local.availability_zones, zone))
  ]
}
