variable "namespace" {
  description = "Name space of the parameter"
  type        = string
}

variable "value" {
  description = "Value of the parameter"
  type        = string
}

variable "description" {
  description = "Description of the parameter"
  type        = string
}

variable "kms_key_arn" {
  description = "ID Of ARN Key"
  type        = string
}

variable "allowed_pattern" {
  type        = string
  description = "A regular expression used to validate the parameter value (e.g., '^[a-zA-Z0-9]*$')"
  default     = null
}

variable "tags" {
  description = "Tags to apply to the resource"
  type        = map(string)
  default     = {}
}
