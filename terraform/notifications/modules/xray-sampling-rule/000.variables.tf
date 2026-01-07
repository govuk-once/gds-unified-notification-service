variable "prefix" {
  description = "Prefix of the sampling rule."
  type        = string
}

variable "rule_name" {
  description = "Name of the sampling rule."
  type        = string
}

variable "priority" {
  description = "Priority of the sampling rule."
  type        = number
  default     = 9999
}

variable "reservoir" {
  description = "A fixed number of matching requests to instrument per second."
  type        = number
  default     = 1
}

variable "fixed_rate" {
  description = "The percentage of matching requests to instrument."
  type        = number
  default     = 0.05
}

variable "attributes" {
  description = "Matches attributes derived from the request."
  type        = map(string)
  default     = {}
}
