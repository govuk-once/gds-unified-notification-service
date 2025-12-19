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

variable "global_tags" {
  description       = ""
  type              = map(string)
  default           = {}
}
