// Notes for creation - Grab content from AWS Cloudwatch dashboard -> View edit source
// Replace regions (i.e. eu-west-2) with var.region
// Replace API Gateway names with relevant references i.e. module.api_gateway_pso.apigw_name
// Replace Namespaces (i.e. "NOTIFICATIONS_GDSUNS_DEV" with upper(replace("NOTIFICATIONS_${local.prefix}", "-","_"))
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = join("-", [local.prefix, "pso", "utilisation"])
  region         = var.region
  dashboard_body = jsonencode({
    "widgets" : [
      {
        "type" : "metric",
        "x" : 0,
        "y" : 0,
        "width" : 6,
        "height" : 7,
        "properties" : {
          "metrics" : [
            [
              {
                "expression" : "SUM(METRICS())",
                "label" : "Expression1",
                "id" : "e1",
                "visible" : false,
                "region" : var.region,
                "period" : 60
              }
            ],
            [
              "AWS/ApiGateway",
              "Count",
              "ApiName",
              module.api_gateway_pso.apigw_name,
              "Resource",
              "/send",
              "Stage",
              "api",
              "Method",
              "POST",
              {
                "id" : "m6",
                "label" : "Incoming",
                "region" : var.region
              }
            ],
            [
              upper(replace("NOTIFICATIONS_${local.prefix}", "-", "_")),
              "QUEUE_PROCESSING_PUBLISHED_SUCCESSFULLY",
              "environment",
              local.prefix,
              "service",
              "NOTIFICATIONS_POSTMESSAGE",
              {
                "id" : "m3",
                "region" : var.region,
                "label" : "Queued Successfully"
              }
            ],
            [
              "AWS/ApiGateway",
              "4XXError",
              "ApiName",
              module.api_gateway_pso.apigw_name,
              "Resource",
              "/send",
              "Stage",
              "api",
              "Method",
              "POST",
              {
                "id" : "m1",
                "label" : "4XX Error"
              }
            ],
            [
              ".",
              "5XXError",
              ".",
              ".",
              ".",
              ".",
              ".",
              ".",
              ".",
              ".",
              {
                "id" : "m2",
                "label" : "5XX Error"
              }
            ]
          ],
          "view" : "singleValue",
          "stacked" : false,
          "region" : var.region,
          "stat" : "Sum",
          "period" : 60,
          "title" : "Incoming Notification Totals",
          "liveData" : true,
          "sparkline" : true,
          "start" : "-PT1M",
          "end" : "P0D"
        }
      },
      {
        "type" : "metric",
        "x" : 0,
        "y" : 7,
        "width" : 18,
        "height" : 10,
        "properties" : {
          "metrics" : [
            [
              "AWS/ApiGateway",
              "Count",
              "ApiName",
              module.api_gateway_pso.apigw_name,
              {
                "region" : var.region
              }
            ]
          ],
          "view" : "timeSeries",
          "stacked" : true,
          "region" : var.region,
          "stat" : "Sum",
          "period" : 60,
          "title" : "History ",
          "legend" : {
            "position" : "hidden"
          }
        }
      },
      {
        "type" : "metric",
        "x" : 6,
        "y" : 0,
        "width" : 6,
        "height" : 7,
        "properties" : {
          "metrics" : [
            [
              {
                "expression" : "SUM(METRICS())",
                "label" : "Expression1",
                "id" : "e1",
                "visible" : false,
                "region" : var.region,
                "period" : 86400
              }
            ],
            [
              "AWS/ApiGateway",
              "Count",
              "ApiName",
              module.api_gateway_pso.apigw_name,
              "Resource",
              "/send",
              "Stage",
              "api",
              "Method",
              "POST",
              {
                "id" : "m6",
                "label" : "Incoming",
                "region" : var.region
              }
            ],
            [
              upper(replace("NOTIFICATIONS_${local.prefix}", "-", "_")),
              "QUEUE_PROCESSING_PUBLISHED_SUCCESSFULLY",
              "environment",
              local.prefix,
              "service",
              "NOTIFICATIONS_POSTMESSAGE",
              {
                "id" : "m3",
                "region" : var.region,
                "label" : "Queued Successfully"
              }
            ],
            [
              "AWS/ApiGateway",
              "4XXError",
              "ApiName",
              module.api_gateway_pso.apigw_name,
              "Resource",
              "/send",
              "Stage",
              "api",
              "Method",
              "POST",
              {
                "id" : "m1",
                "label" : "4XX Error"
              }
            ],
            [
              ".",
              "5XXError",
              ".",
              ".",
              ".",
              ".",
              ".",
              ".",
              ".",
              ".",
              {
                "id" : "m2",
                "label" : "5XX Error"
              }
            ]
          ],
          "view" : "singleValue",
          "stacked" : false,
          "region" : var.region,
          "stat" : "Sum",
          "period" : 86400,
          "title" : "Incoming Notification Totals",
          "liveData" : true,
          "sparkline" : true,
          "start" : "-PT24H",
          "end" : "P0D"
        }
      },
      {
        "type" : "metric",
        "x" : 12,
        "y" : 0,
        "width" : 6,
        "height" : 7,
        "properties" : {
          "metrics" : [
            [
              {
                "expression" : "SUM(METRICS())",
                "label" : "Expression1",
                "id" : "e1",
                "visible" : false,
                "region" : var.region,
                "period" : 604800
              }
            ],
            [
              "AWS/ApiGateway",
              "Count",
              "ApiName",
              module.api_gateway_pso.apigw_name,
              "Resource",
              "/send",
              "Stage",
              "api",
              "Method",
              "POST",
              {
                "id" : "m6",
                "label" : "Incoming",
                "region" : var.region
              }
            ],
            [
              upper(replace("NOTIFICATIONS_${local.prefix}", "-", "_")),
              "QUEUE_PROCESSING_PUBLISHED_SUCCESSFULLY",
              "environment",
              local.prefix,
              "service",
              "NOTIFICATIONS_POSTMESSAGE",
              {
                "id" : "m3",
                "region" : var.region,
                "label" : "Queued Successfully"
              }
            ],
            [
              "AWS/ApiGateway",
              "4XXError",
              "ApiName",
              module.api_gateway_pso.apigw_name,
              "Resource",
              "/send",
              "Stage",
              "api",
              "Method",
              "POST",
              {
                "id" : "m1",
                "label" : "4XX Error",
                "region" : var.region
              }
            ],
            [
              ".",
              "5XXError",
              ".",
              ".",
              ".",
              ".",
              ".",
              ".",
              ".",
              ".",
              {
                "id" : "m2",
                "label" : "5XX Error",
                "region" : var.region
              }
            ]
          ],
          "view" : "singleValue",
          "stacked" : false,
          "region" : var.region,
          "stat" : "Sum",
          "period" : 604800,
          "title" : "Incoming Notification Totals",
          "liveData" : true,
          "sparkline" : true,
          "start" : "-PT168H",
          "end" : "P0D"
        }
      }
    ]
  })
}
