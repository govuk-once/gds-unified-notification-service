/** Metadata **/
variable "prefix" {
  description = "Prefix to be used when naming resources"
  type        = string
}

variable "queue_name" {
  type        = string
  description = "Name of the queue."
}

variable "tags" {
  description = "Tags to apply to the resource."
  type        = map(string)
  default     = {}
}

variable "delay_seconds" {
  type        = number
  description = "The time in seconds that the delivery of all messages in the queue will be delayed"
  default     = 90
}

variable "max_message_size" {
  type        = number
  description = "The limit of how many bytes a message can contain before Amazon SQS rejects it"
  default     = 2048
}

variable "message_retention_seconds" {
  type        = number
  description = "The number of seconds Amazon SQS retains a message."
  default     = 86400
}

variable "receive_wait_time_seconds" {
  type        = number
  description = "The time for which a ReceiveMessage call will wait for a message."
  default     = 10
}

variable "visibility_timeout_seconds" {
  description = "The length of time during which a message will be unavailable after a consumer receives it."
  type        = number
  default     = 30
}

variable "kms_key_arn" {
  description = "ID Of ARN Key"
  type        = string
}

variable "kms_data_key_reuse_period_seconds" {
  description = "The length of time, in seconds, for which a data key can be reused to encrypt or decrypt messages before calling AWS KMS again."
  type        = number
  default     = 300
}

variable "create_dead_letter_queue" {
  description = "Whether to create a Dead Letter Queue for this SQS queue"
  type        = bool
  default     = false
}

variable "max_receieve" {
  description = "Number of times a message is delivered before being moved to the dead letter queue"
  type        = number
  default     = 3
}

variable "dead_letter_queue_delay_seconds" {
  description = "Delivery delay for dead letter queue in seconds"
  type        = number
  default     = 0
}

variable "dead_letter_queue_message_retention_seconds" {
  description = "How long the dead letter queue retains messages before expiry"
  type        = number
  default     = 1209600
}
