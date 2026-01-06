/** Metadata **/
variable "project_name" {
  description       = "GDS-Unified-Notifications-Service"
  type              = string
}

variable "table_name" {
  description       = "Alpha"
  type              = string
}

variable "hash_key" {
  description       = ""
  type              = string
}

variable "range" {
  description       = ""
  type              = string
  default           = null
}

variable "tags" {
  description       = ""
  type              = map(string)
  default           = {}
}

variable "read_capacity" {
  description       = ""
  type              = number
  default           = 20
}

variable "write_capacity" {
  description       = ""
  type              = number
  default           = 20
}

variable deletion_window_in_days {
  description       = ""
  type              = number
  default           = 10
}
