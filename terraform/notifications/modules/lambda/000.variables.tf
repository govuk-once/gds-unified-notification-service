variable "prefix" {
  description = "Prefix to be used when naming resources"
  type        = string
}

variable "function_name" {
  description = "Name of lambda function"
  type        = string
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs24.x"
}

variable "bundle_path" {
  description = "Path to lambda source code zip"
  type        = string
}

variable "memory_size" {
  description = "Lambda memory size in MB"
  type        = number
  default     = 512
}

variable "timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags to apply to the resource"
  type        = map(string)
  default     = {}
}

variable "log_retention_days" {
  description = "Number of days to retain the logs"
  type        = number
  default     = 30
}
