/** Metadata **/
variable "prefix" {
  description = "Prefix to be used when naming resources"
  type        = string
}

variable "name" {
  description = "Name of api gateway"
  type        = string
}

variable "tags" {
  description = "Tags to apply to the resource"
  type        = map(string)
  default     = {}
}

/** Instance config **/
variable "stage_name" {
  description = "Name of the API Gateway stage to use when deploying"
  type        = string
  default     = "api"
}

variable "log_retention_days" {
  description = "Amount of days to persist access logs for"
  type        = number
  default     = 30
}

variable "kms_key_arn" {
  description = "ID Of ARN Key"
  type        = string
}

/** Integrations injection for lambdas **/
variable "integrations" {
  type = map(object({
    method               = string
    path                 = string
    lambda_function_name = string
    lambda_invoke_arn    = string
  }))
}
