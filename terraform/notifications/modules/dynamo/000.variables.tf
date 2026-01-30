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

variable "attributes" {
  description = "List of attribute definitions name & type properties are required for each, both are string values"
  type        = list(map(string))
  default     = []
}

variable "global_secondary_indexes" {
  description = "Definition for global indexes to add to the dynamodb table"
  type        = any
  default     = []
}

