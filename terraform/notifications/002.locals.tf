locals {
  project = "gdsuns"
  prefix  = "${local.project}-${var.env}"
  defaultTags = {
    project = "UNS"
  }
}
