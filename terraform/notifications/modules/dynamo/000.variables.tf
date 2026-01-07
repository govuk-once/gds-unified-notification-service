/** Metadata **/
variable "prefix" {
  description = "Prefix to be used when naming resources"
  type        = string
}

variable "table_name" {
  description = "Name of dynamodb table"
  type        = string
}

variable "tags" {
  description = "Tags to apply to the resource"
  type        = map(string)
  default     = {}
}

/** Instance config **/
variable "hash_key" {
  description = "Main primary key to use within tables, i.e. id"
  type        = string
  nullable    = true
}

variable "range_key" {
  description = "Main sorting key to use within tables i.e. date"
  type        = string
  nullable    = true
}

variable "kms_key_arn" {
  type        = string
  description = "Existing KMS key"
}
