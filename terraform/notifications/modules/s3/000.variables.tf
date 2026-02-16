/** Metadata **/
variable "prefix" {
  description = "Prefix to be used when naming resources"
  type        = string
}

variable "name" {
  description = "Name of bucket table"
  type        = string
}

variable "tags" {
  description = "Tags to apply to the resource"
  type        = map(string)
  default     = {}
}

# Encryption at rest
variable "kms_key_arn" {
  type        = string
  description = "Existing KMS key"
}
