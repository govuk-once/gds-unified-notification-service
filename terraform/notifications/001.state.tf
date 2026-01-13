variable "bucket" {
  type        = string
  description = "Name of the bucket"
}

variable "key" {
  type        = string
  description = "Name of the key"
}

variable "region" {
  type        = string
  description = "Region the module is in"
}

variable "env" {
  type        = string
  description = "Name of environment"
}

variable "cidr_main" {
  type        = string
  description = "Default CIDR"
  default     = "10.0.0.0/16"
}


terraform {
  backend "s3" {
    bucket = var.bucket
    key    = var.key
    region = var.region
  }
}
