locals {
  project = "gdsuns"
  prefix  = "${local.project}-${var.env}"
  defaultTags = {
    project   = "UNS"
    env       = var.env
    managedBy = "Terraform"
    version   = var.code_version
  }

  availability_zones = [for zone in ["a", "b", "c"] : "${var.region}${zone}"]
}
