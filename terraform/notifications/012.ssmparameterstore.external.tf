// Note: Parameters defined in this module are to be managed outside of the IaC
// This module only creates defaults if they do not already exist within the IaC and populates parameters with default values
module "parameter_store_external_configuration" {
  source = "./modules/parameter-store"

  namespace   = local.prefix
  kms_key_arn = aws_kms_key.main.arn

  // Values are created with placeholder and developers are expected to manually update them externally
  update_values = false

  parameters = {
    "config/common/enabled"     = "true"
    "config/validation/enabled" = "true"
    "config/processing/enabled" = "true"
    "config/dispatch/enabled"   = "true"

    # Processing
    "config/processing/adapter" = "VOID" # Enum: VOID, OneSignal

    # Dispatch
    "config/dispatch/adapter" = "VOID" # Enum: VOID, OneSignal
    #checkov:skip=CKV_SECRET_6: "Base64 High Entropy String"
    "config/dispatch/onesignal/apiKey" = "placeholder"
    #checkov:skip=CKV_SECRET_6: "Base64 High Entropy String"
    "config/dispatch/onesignal/appId" = "placeholder"

    # Common
    "config/common/cache/notificationsProviderRateLimitPerMinute" = "5"
    # Circuit breaker config
    "config/dispatch/circuitBrekaer/threshold"         = "5"
    "config/dispatch/circuitBrekaer/halfOpenAfter"     = "30"
    "config/dispatch/circuitBrekaer/windowDuration"    = "60"
    "config/dispatch/circuitBrekaer/rateLimitWhenOpen" = "5"

    #checkov:skip=CKV_SECRET_6: "Base64 High Entropy String"
    "api/flex/apiKey" = "mockApiKey"

    # Default values for url content control within the data
    "content/allowed/protocols"     = "govuk:,https:"
    "content/allowed/urlHostnames"  = "*.gov.uk"
    "notification/deeplinkTemplate" = "govuk://app.gov.uk/notificationcentre/detail?id={id}"

    // Configurations for FLEX & UDP - these values are serialized JSON
    "flex/account" = "null"
    "flex/vpce"    = "null"

    "udp/config/sm"   = "null"
    "udp/config/kms"  = "null"
    "udp/config/role" = "null"
  }
}
