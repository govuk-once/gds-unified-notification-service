locals {
  # Add any services that use circuit breakers to the array
  services_with_circuit_breaker = [module.lambda_pso_dispatch.lambda_service_name]

  dashboard_body = jsonencode({
    "widgets" : flatten([
      for index, service_name in local.services_with_circuit_breaker : [{
        "type" : "metric",
        "x" : 12 * index,
        "y" : 0,
        "width" : 6,
        "height" : 6,
        "properties" : {
          "metrics" : [
            [
              upper(replace("NOTIFICATIONS_${local.prefix}", "-", "_")),
              "CIRCUIT_BREAKER_STATE",
              "environment",
              local.prefix,
              "service",
              service_name,
              {
                "region" : var.region,
                "label" : "Circuit Breaker State"
              }
            ]
          ],
          "view" : "singleValue",
          "stacked" : false,
          "region" : var.region,
          "stat" : "Maximum",
          "period" : 1,
          "title" : "${service_name} - Circuit Breaker State",
          "liveData" : true,
        }
        },
        {
          "type" : "metric",
          "x" : 6 + 12 * index,
          "y" : 0,
          "width" : 6,
          "height" : 6,
          "properties" : {
            "metrics" : [
              [
                upper(replace("NOTIFICATIONS_${local.prefix}", "-", "_")),
                "RATE_LIMITING_ENABLED",
                "environment",
                local.prefix,
                "service",
                service_name,
                {
                  "region" : var.region,
                  "label" : "Rate Limiting Enabled"
                }
              ]
            ],
            "view" : "singleValue",
            "stacked" : false,
            "region" : var.region,
            "stat" : "Maximum",
            "period" : 1,
            "title" : "${service_name} - Rate Limiting State",
            "liveData" : true,
          }
        },
        {
          "type" : "metric",
          "x" : 0 + 12 * index,
          "y" : 7,
          "width" : 6,
          "height" : 6,
          "properties" : {
            "metrics" : [
              [
                upper(replace("NOTIFICATIONS_${local.prefix}", "-", "_")),
                "CIRCUIT_BREAKER_FAILURE",
                "environment",
                local.prefix,
                "service",
                service_name,
                {
                  "region" : var.region,
                  "label" : "Circuit Breaker Failure"
                }
              ],
              [
                upper(replace("NOTIFICATIONS_${local.prefix}", "-", "_")),
                "CIRCUIT_BREAKER_SUCCESS",
                "environment",
                local.prefix,
                "service",
                service_name,
                {
                  "region" : var.region,
                  "label" : "Circuit Breaker Success"
                }
              ]
            ],
            "view" : "timeSeries",
            "stacked" : false,
            "region" : var.region,
            "stat" : "Sum",
            "period" : 1,
            "title" : "${service_name} - Circuit Breaker Failure/Success",
            "liveData" : true
          }
        },
        {
          "type" : "metric",
          "x" : 6 + 12 * index,
          "y" : 7,
          "width" : 6,
          "height" : 6,
          "properties" : {
            "metrics" : [
              [
                upper(replace("NOTIFICATIONS_${local.prefix}", "-", "_")),
                "CURRENT_RATE",
                "environment",
                local.prefix,
                "service",
                service_name,
                {
                  "region" : var.region,
                  "label" : "Current rate"
                }
              ],
            ],
            "view" : "timeSeries",
            "stacked" : false,
            "region" : var.region,
            "stat" : "Sum",
            "period" : 1,
            "title" : "${service_name} - Current % Usage",
            "liveData" : true
          }
      }]
    ])
  })
}

resource "aws_cloudwatch_dashboard" "platform_state" {
  dashboard_name = join("-", [local.prefix, "platform-statues"])
  region         = var.region
  dashboard_body = local.dashboard_body
}
