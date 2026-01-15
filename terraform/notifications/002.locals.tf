locals {
  project = "gdsuns"
  prefix  = "${local.project}-${var.env}"
  defaultTags = {
    project   = "UNS"
    env       = var.env
    managedBy = "Terraform"
  }

  availability_zones = [for zone in ["a", "b", "c"] : "${var.region}${zone}"]
}
