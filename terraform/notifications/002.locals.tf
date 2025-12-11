locals {
  project = "gdpuns"
  prefix  = "${local.project}-${var.env}"
  defaultTags = {
    project = "UNS"
  }
}
