/** Metadata **/
variable "prefix" {
  description = "Prefix to be used when naming resources"
  type        = string
}

variable "region" {
  description = "Region of the resources"
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

variable "disable_execute_api_endpoint" {
  description = "value"
  type        = bool
  default     = false
}

/** Custom domain **/
variable "is_main_environment_in_account" {
  type        = bool
  description = "Used to detect whether the environment deployed is the main one in the account (i.e. dev, uat, prod) and not sandbox/ephemeral - ephemeral/sandbox domain contain env name prefix - main environments do not"
  default     = false
}
variable "route_53_zone" {
  description = "value"
  type        = string
  nullable    = true
  default     = null
}

/** Authorizers **/
variable "mtls_truststore_url" {
  description = "s3 object url pointing at the trust store - set to null if mTLS is not in use, note : can only be used together with route_53_zone"
  type        = string
  nullable    = true
  default     = null
}

variable "authorizers" {
  description = "Invoke ARN of lambda authorizer"
  type = map(object({
    lambda_arn           = string
    lambda_function_name = string
    lambda_invoke_arn    = string
  }))
  default = {}
}

/** Integrations injection for lambdas **/
variable "integrations" {
  type = map(object({
    method               = string
    path                 = string
    lambda_function_name = string
    lambda_invoke_arn    = string
    authorizer           = optional(string)
  }))
}
