module "xray_sampling_rule_global" {
  source = "./modules/xray-sampling-rule"

  prefix     = local.prefix
  rule_name  = "global"
  priority   = 9999
  reservoir  = 1
  fixed_rate = 0.05
}
