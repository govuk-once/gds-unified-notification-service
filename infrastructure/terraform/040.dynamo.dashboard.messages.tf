resource "aws_cloudwatch_dashboard" "messages_consumed_capacity" {
  dashboard_name = join("-", [local.prefix, "messages-consumed-capacity"])
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
              "AWS/DynamoDB",
              "ConsumedWriteCapacityUnits",
              "TableName",
              module.dynamodb_inbound_messages.table_name,
              {
                "label" : "Write Capacity",
                "region" : var.region
              }
            ],
            [
              ".",
              "ConsumedReadCapacityUnits",
              ".",
              ".",
              {
                "label" : "Read Capacity",
                "region" : var.region
              }
            ]
          ],
          "view" : "timeSeries",
          "stacked" : false,
          "region" : var.region,
          "stat" : "Sum",
          "period" : 1,
          "title" : "Consumed Capacity",
          "liveData" : true
        }
      }
    ]
  })
}
