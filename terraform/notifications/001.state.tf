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

variable "is_main_environment_in_account" {
  type        = bool
  description = "Used to detect whether the environment deployed is the main one in the account (i.e. dev, uat, prod) and not sandbox/ephemeral"
  default     = false
}


variable "code_version" {
  type        = string
  description = "Released code version"
  default     = "Manual release"
}

variable "cidr_main" {
  type        = string
  description = "Default CIDR"
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  type        = string
  description = "availability zones, comma separated"
  default     = "a,b,c"
}

variable "use_mtls" {
  type        = bool
  description = "Whether mTLS features should be enabled - Note: disabling this is only acceptable for dev sandbox environments"
  default     = true
}

terraform {
  backend "s3" {
    bucket = var.bucket
    key    = var.key
    region = var.region
  }
}
