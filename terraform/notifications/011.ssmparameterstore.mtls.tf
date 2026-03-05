# Fetch exports from mtls repo for current env
locals {
  mtls_ssm_root_path = "/gdsunsmtls-${var.env}/exports"
}

data "aws_ssm_parameters_by_path" "mtls" {
  path            = local.mtls_ssm_root_path
  with_decryption = true
  recursive       = true
}

# Map ssm params by path call to a map of key values
locals {
  mtls_ssm_exports = {
    for index, key in nonsensitive(data.aws_ssm_parameters_by_path.mtls.names) :
    replace(key, local.mtls_ssm_root_path, "") => element(nonsensitive(data.aws_ssm_parameters_by_path.mtls.values), index)
  }
}

# Parse values with fallback - allowing for non existence of ssm params
locals {
  mtls_config_available = try(local.mtls_ssm_exports["/pso/truststore"], null) == null ? false : true
  #
  mtls_pso_truststore = try(local.mtls_ssm_exports["/pso/truststore"], null)
  mtls_root_domain    = try(local.mtls_ssm_exports["/domain"], null)
  mtls_kms            = try(local.mtls_ssm_exports["/kms"], null)

  # mTLS Revocation table
  mtls_table_arn        = try(local.mtls_ssm_exports["/table/mtls/arn"], null)
  mtls_table_name       = try(local.mtls_ssm_exports["/table/mtls/name"], "")
  mtls_table_attributes = try(local.mtls_ssm_exports["/table/mtls/attributes"], "")
}
