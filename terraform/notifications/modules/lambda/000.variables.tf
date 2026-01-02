/** Metadata **/
variable "prefix" {
  description = "Prefix to be used when naming resources"
  type        = string
}

variable "function_name" {
  description = "Name of lambda function"
  type        = string
}

variable "tags" {
  description = "Tags to apply to the resource"
  type        = map(string)
  default     = {}
}

/** Instance config **/
variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs24.x"
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

variable "log_retention_days" {
  description = "Number of days to retain the logs"
  type        = number
  default     = 30
}

variable "kms_key_arn" {
  description = "ID Of ARN Key"
  type        = string
}


variable "trigger_queue_name" {
  description = "The ARN of the SQS queue to use as an event source for this Lambda. Setting this enables the SQS trigger feature flag."
  type        = string
  default     = null
}

variable "batch_size" {
  description = "Largest number of records that Lambda will retrieve from your event source at the time of invocation"
  type        = number
  default     = 10
}

variable "maximum_concurrency" {
  description = "Limits the number of concurrent instances that the event source can invoke"
  type        = number
  default     = 100
}

/** Code **/
variable "bundle_path" {
  description = "Path to lambda source code zip"
  type        = string
}

variable "insights_enabled" {
  type    = bool
  default = true
  description = "Enables insights for xray"
}

variable "notifications_enabled" {
  type    = bool
  default = false
  description = "Enables notifications for xray"
}
