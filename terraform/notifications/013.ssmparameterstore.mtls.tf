// Note: Values referenced in this module are generated outside of this repository and pulled into the configuration

# Fetch exports from mtls repo for current env
locals {
  mtls_ssm_root_path = "/gdsunsmtls-${var.mtls_env_to_use == null ? var.env : var.mtls_env_to_use}/exports"
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
  mtls_enabled = var.use_mtls ? (try(local.mtls_ssm_exports["/pso/truststore"], null) == null ? false : true) : false
  #
  mtls_pso_truststore = try(local.mtls_ssm_exports["/pso/truststore"], null)
  mtls_root_domain    = try(local.mtls_ssm_exports["/domain"], null)
  mtls_kms            = try(local.mtls_ssm_exports["/kms"], null)

  # mTLS Revocation table
  mtls_table_arn        = try(local.mtls_ssm_exports["/table/mtls/arn"], null)
  mtls_table_name       = try(local.mtls_ssm_exports["/table/mtls/name"], "")
  mtls_table_attributes = try(local.mtls_ssm_exports["/table/mtls/attributes"], "")
}

# Only applying when mtls_env_to_use is set to a different value than env, which is only used in cases of developer sandbox environments
# Remapping truststore.pem to truststore-${env}.pem when it's being reused
# Note: Truststore in s3 has to be manually duplicated
locals {
  mtls_pso_truststore_mapped = (var.mtls_env_to_use != null && var.mtls_env_to_use != var.env && local.mtls_pso_truststore != null) ? replace(local.mtls_pso_truststore, ".pem", "-${var.env}.pem") : local.mtls_pso_truststore
}
