locals {
  project = "gdpuns"
  prefix  = "${local.project}-${var.env}"
  defaultTags = {
    project = "UNS"
  }

  availability_zones = [for zone in ["a", "b", "c"] : "${var.region}${zone}"]
}
