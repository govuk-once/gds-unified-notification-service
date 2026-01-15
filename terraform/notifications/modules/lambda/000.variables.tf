/** Metadata **/
variable "prefix" {
  description = "Prefix to be used when naming resources"
  type        = string
}

variable "region" {
  description = "Region of resources"
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
  default     = "nodejs22.x"
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

variable "trigger_queue_arn" {
  description = "The ARN of the SQS queue to use as an event source for this Lambda. Setting this enables the SQS trigger feature flag."
  type        = string
  default     = null
}

variable "publish_queue_arns" {
  description = "A list of the ARNs of the SQS Queues to publish messages to."
  type        = list(string)
  default     = []
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

variable "additional_policy_arns" {
  description = "Map of Policy ARNs"
  type        = map(string)
  default     = {}
}

/** Code **/
variable "codesigning_config_id" {
  description = "ID of codesigning config"
  type        = string
}
variable "codesigning_profile_id" {
  description = "ID of codesigning profile"
  type        = string
}

variable "s3_bucket_id" {
  description = "ID of s3 bucket to store signed lambda code in"
  type        = string
}

variable "bundle_path" {
  description = "Path to lambda source code zip"
  type        = string
}

// Lambda in VPC
variable "security_group_ids" {
  description = "Security group IDs"
  type        = list(string)
  nullable    = true
  default     = null
}

variable "dynamo_table_arns" {
  description = "A list of the ARNs of the DyanmoDB"
  type        = list(string)
  default     = []
}
variable "subnet_ids" {
  description = "Subnet IDs"
  type        = list(string)
  nullable    = true
  default     = null
}

