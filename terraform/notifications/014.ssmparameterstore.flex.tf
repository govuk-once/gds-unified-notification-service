# Note: SSM Parameters in this file are created as defaults as part of ssmparameterstore.internal.tf - values are to be managed manually
data "aws_ssm_parameters_by_path" "flex" {
  path            = "/${local.prefix}/flex"
  with_decryption = true
  recursive       = true
}

# Map ssm params by path call to a map of key values
locals {
  flex_config = {
    for index, key in(data.aws_ssm_parameters_by_path.flex.names) :
    replace(key, "/${local.prefix}/flex", "") => element(data.aws_ssm_parameters_by_path.flex.values, index)
  }
}

# Parse values with fallbacks - allowing for non existence of ssm params
locals {
  flex_vpces = tolist((jsondecode(try(local.flex_config["/vpce"], "[]"))))
}
