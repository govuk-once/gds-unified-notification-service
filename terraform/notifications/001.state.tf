variable "bucket" {
  type = string
  description = "Name of the bucket"
}

variable "key" {
  type = string
  description = "Name of the key"
}

variable "region" {
  type = string
  description = "Region the module is in"
}

variable "env" {
  type = string
  description = "Name of environment"
}

terraform {
  backend "s3" {
    bucket = var.bucket
    key    = var.key
    region = var.region
  }
}
