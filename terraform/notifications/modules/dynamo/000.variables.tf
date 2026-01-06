/** Metadata **/
variable "prefix" {
  description = "GDS-Unified-Notifications-Service"
  type        = string
}

variable "table_name" {
  description = "Alpha"
  type        = string
  default     = "123"
}

variable "hash_key" {
  description = ""
  type        = string
  default     = "123"
}

variable "range_key" {
  description = ""
  type        = string
  default     = "123"
}

variable "tags" {
  description = ""
  type        = map(string)
  default     = {}
}

variable "deletion_window_in_days" {
  description = ""
  type        = number
  default     = 10
}

variable "kms_key_arn" {
  type        = string
  description = "Existing KMS key"
}
