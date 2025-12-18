
/** Instance config **/
variable "api_gateway_arn" {
  description = "ID of API Gateway"
  type        = string
}
variable "api_gateway_id" {
  description = "ID of API Gateway"
  type        = string
}
variable "api_gateway_root_resource_id" {
  description = "ID of API Gateway root"
  type        = string
}

variable "api_gateway_execution_arn" {
  description = "ID of API Gateway root"
  type        = string
}

/** Rest definition **/
variable "path" {
  description = "Path to be created within API Gateway"
  type        = string
}

variable "method" {
  description = "Method to be used within API Gateway"
  type        = string
  validation {
    condition     = contains(["ANY", "HEAD", "GET", "PUT", "POST", "PATCH", "DELETE"], var.method)
    error_message = "Method must be one of: ANY, HEAD, GET, PUT, POST, PATCH, DELETE"
  }
}

variable "lambda_function_name" {
  description = "Invocation ARN for the lambda"
  type        = string
}

variable "lambda_invoke_arn" {
  description = "Invocation ARN for the lambda"
  type        = string
}
