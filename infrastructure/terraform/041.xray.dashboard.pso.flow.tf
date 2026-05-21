// Notes for creation - Grab content from AWS Cloudwatch dashboard -> View edit source
// Replace regions (i.e. eu-west-2) with var.region
// Replace API Gateway names with relevant references i.e. module.api_gateway_pso.apigw_name
// Replace Namespaces (i.e. "NOTIFICATIONS_GDSUNS_DEV" with upper(replace("NOTIFICATIONS_${local.prefix}", "-","_"))
// Replace SQS Names with module references i.e.  module.sqs_processing.name
// Replace Lambda names with function name references i.e. module.lambda_flex_getNotifications.lambda_function_name
resource "aws_cloudwatch_dashboard" "pso_flow" {
  dashboard_name = join("-", [local.prefix, "flow"])
  region         = var.region
  dashboard_body = jsonencode({
    "widgets" : [
      {
        "type" : "metric",
        "x" : 6,
        "y" : 0,
        "width" : 6,
        "height" : 6,
        "properties" : {
          "metrics" : [
            [
              "AWS/SQS",
              "NumberOfMessagesSent",
              "QueueName",
              module.sqs_processing.sqs_queue_name,
              {
                "region" : var.region
              }
            ],
            [
              ".",
              "NumberOfMessagesReceived",
              ".",
              ".",
              {
                "region" : var.region
              }
            ],
            [
              ".",
              "ApproximateNumberOfMessagesVisible",
              ".",
              ".",
              {
                "label" : "Queue Depth",
                "region" : var.region
              }
            ]
          ],
          "view" : "timeSeries",
          "stacked" : false,
          "region" : var.region,
          "stat" : "Sum",
          "period" : 1,
          "title" : "Processing Queue",
          "liveData" : true
        }
      },
      {
        "type" : "metric",
        "x" : 6,
        "y" : 6,
        "width" : 6,
        "height" : 6,
        "properties" : {
          "metrics" : [
            [
              "AWS/Lambda",
              "Invocations",
              "FunctionName",
              module.lambda_pso_processing.lambda_function_name,
              {
                "region" : var.region
              }
            ],
            [
              ".",
              "Errors",
              ".",
              ".",
              {
                "region" : var.region
              }
            ]
          ],
          "view" : "timeSeries",
          "stacked" : false,
          "region" : var.region,
          "period" : 1,
          "stat" : "Sum",
          "title" : "Notifications Processed",
          "liveData" : true
        }
      },
      {
        "type" : "metric",
        "x" : 12,
        "y" : 0,
        "width" : 6,
        "height" : 6,
        "properties" : {
          "metrics" : [
            [
              "AWS/SQS",
              "NumberOfMessagesSent",
              "QueueName",
              module.sqs_dispatch.sqs_queue_name,
              {
                "region" : var.region
              }
            ],
            [
              ".",
              "NumberOfMessagesReceived",
              ".",
              ".",
              {
                "region" : var.region
              }
            ],
            [
              ".",
              "ApproximateNumberOfMessagesVisible",
              ".",
              ".",
              {
                "label" : "Queue Depth",
                "region" : var.region
              }
            ]
          ],
          "view" : "timeSeries",
          "stacked" : false,
          "region" : var.region,
          "stat" : "Sum",
          "period" : 1,
          "title" : "Dispatch Queue",
          "liveData" : true
        }
      },
      {
        "type" : "metric",
        "x" : 12,
        "y" : 6,
        "width" : 6,
        "height" : 6,
        "properties" : {
          "metrics" : [
            [
              "AWS/Lambda",
              "Invocations",
              "FunctionName",
              module.lambda_pso_dispatch.lambda_function_name,
              {
                "region" : var.region
              }
            ],
            [
              ".",
              "Errors",
              ".",
              ".",
              {
                "region" : var.region
              }
            ]
          ],
          "view" : "timeSeries",
          "stacked" : false,
          "region" : var.region,
          "period" : 1,
          "stat" : "Sum",
          "title" : "Notifications Dispatched",
          "liveData" : true
        }
      },
      {
        "type" : "metric",
        "x" : 0,
        "y" : 0,
        "width" : 6,
        "height" : 6,
        "properties" : {
          "metrics" : [
            [
              "AWS/WAFV2",
              "BlockedRequests",
              "WebACL",
              module.api_gateway_pso.waf_name,
              "Region",
              var.region,
              "Rule",
              "ALL",
              {
                "region" : var.region,
                "color" : "#d62728"
              }
            ],
            [
              ".",
              "AllowedRequests",
              ".",
              ".",
              ".",
              ".",
              ".",
              ".",
              {
                "region" : var.region,
                "color" : "#2ca02c"
              }
            ]
          ],
          "view" : "timeSeries",
          "stacked" : true,
          "region" : var.region,
          "stat" : "Sum",
          "period" : 1,
          "title" : "Web App Firewall per Second"
        }
      },
      {
        "type" : "metric",
        "x" : 18,
        "y" : 0,
        "width" : 5,
        "height" : 6,
        "properties" : {
          "metrics" : [
            [
              "global",
              "SentToOneSignalComplete",
              {
                "region" : var.region,
                "label" : "Accepted"
              }
            ]
          ],
          "view" : "timeSeries",
          "stacked" : true,
          "region" : var.region,
          "stat" : "Sum",
          "period" : 1,
          "title" : "Sent to OneSignal per Second"
        }
      },
      {
        "type" : "metric",
        "x" : 0,
        "y" : 6,
        "width" : 6,
        "height" : 6,
        "properties" : {
          "metrics" : [
            [
              {
                "expression" : "m3-m1-m2",
                "label" : "2xx Reponse",
                "id" : "e1",
                "color" : "#9467bd"
              }
            ],
            [
              "AWS/ApiGateway",
              "4XXError",
              "ApiName",
              module.api_gateway_pso.apigw_name,
              {
                "region" : var.region,
                "id" : "m1",
                "label" : "4XX Error"
              }
            ],
            [
              ".",
              "5XXError",
              ".",
              ".",
              {
                "region" : var.region,
                "id" : "m2",
                "label" : "5XX Error",
                "color" : "#d62728"
              }
            ],
            [
              ".",
              "Count",
              ".",
              ".",
              {
                "region" : var.region,
                "id" : "m3",
                "label" : "Incoming",
                "color" : "#2ca02c"
              }
            ]
          ],
          "view" : "timeSeries",
          "stacked" : true,
          "region" : var.region,
          "stat" : "Sum",
          "period" : 1,
          "title" : "API per Second"
        }
      }
    ]
  })
}
