variable "bucket" {
  type = string
}

variable "key" {
  type = string
}

variable "region" {
  type = string
}

variable "id" {
  type = string
}

terraform {
  backend "s3" {
    bucket = var.bucket
    key    = var.key
    region = var.region
  }
}
