/** Metadata **/
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
  type = number
  description = "The time in seconds that the delivery of all messages in the queue will be delayed"
}

variable "max_message_size" {
  type = number
  description = "The limit of how many bytes a message can contain before Amazon SQS rejects it"
}

variable "message_retention_seconds" {
  type = number
  description = "The number of seconds Amazon SQS retains a message."
}

variable "receive_wait_time_seconds" {
  type = number
  description = "The time for which a ReceiveMessage call will wait for a message."
}

variable "redrive_policy_max_receives" {
  description = "The number of times a message will be received before being moved to the DLQ."
  type        = number
  default     = 4
}

variable "visibility_timeout_seconds" {
  description = "The length of time during which a message will be unavailable after a consumer receives it."
  type        = number
}
