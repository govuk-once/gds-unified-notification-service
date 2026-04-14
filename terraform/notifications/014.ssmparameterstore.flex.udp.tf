# Note: SSM Parameters in this file are created as defaults as part of ssmparameterstore.internal.tf - values are to be managed manually
data "aws_ssm_parameters_by_path" "flex" {
  path            = "/${local.prefix}/flex"
  with_decryption = true
  recursive       = true
}

data "aws_ssm_parameters_by_path" "udp" {
  path            = "/${local.prefix}/udp"
  with_decryption = true
  recursive       = true
}

# Map ssm params by path call to a map of key values
locals {
  flex_config = {
    for index, key in(data.aws_ssm_parameters_by_path.flex.names) :
    replace(key, "/${local.prefix}/flex", "") => sensitive(element(data.aws_ssm_parameters_by_path.flex.values, index))
  }
  udp_config = {
    for index, key in(data.aws_ssm_parameters_by_path.udp.names) :
    replace(key, "/${local.prefix}/udp", "") => sensitive(element(data.aws_ssm_parameters_by_path.udp.values, index))
  }
}

# Parse values with fallbacks - allowing for non existence of ssm params
locals {
  flex_vpce    = ((jsondecode(try(local.flex_config["/vpce"], "null"))))
  flex_account = ((jsondecode(try(local.flex_config["/account"], "null"))))

  udp_smconfig    = ((jsondecode(try(local.udp_config["/config/sm"], "null"))))
  udp_smconfigkms = ((jsondecode(try(local.udp_config["/config/kms"], "null"))))
  udp_role        = ((jsondecode(try(local.udp_config["/config/role"], "null"))))
}
