variable "namespace" {
  description = "Name space of the parameter"
  type        = string
}

variable "kms_key_arn" {
  description = "ID Of ARN Key"
  type        = string
}

variable "parameters" {
  description = "A map of parameter names and their default initial values"
  type        = map(string)
  default     = {}
}

variable "update_values" {
  description = "whether SSM parameter store should update values in place"
  type        = bool
  default     = false
}
