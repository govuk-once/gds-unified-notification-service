import { Duration } from 'aws-cdk-lib';
import { Dashboard, GraphWidget, LogQueryWidget, MathExpression, Metric } from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSPSOResource } from 'infrastructure/cdk/constructs/UNSPSOResources';

export class UNSPSOFlow extends Construct {
  constructor(scope: Construct, id: string, config: EnvVars, refs: { pso: UNSPSOResource }) {
    super(scope, id);

    const period = Duration.seconds(1);
    const statistic = 'Sum';

    // Row 1: WAF | Processing Queue | Dispatch Queue | OneSignal
    const wafWidget = new GraphWidget({
      title: 'Web App Firewall per Second',
      width: 6,
      height: 6,
      stacked: true,
      region: config.region,
      left: [
        new Metric({
          namespace: 'AWS/WAFV2',
          metricName: 'BlockedRequests',
          dimensionsMap: {
            WebACL: refs.pso.gateway.waf.name!,
            Region: config.region,
            Rule: 'ALL',
          },
          statistic,
          period,
          color: '#d62728',
        }),
        new Metric({
          namespace: 'AWS/WAFV2',
          metricName: 'AllowedRequests',
          dimensionsMap: {
            WebACL: refs.pso.gateway.waf.name!,
            Region: config.region,
            Rule: 'ALL',
          },
          statistic,
          period,
          color: '#2ca02c',
        }),
      ],
    });

    const processingQueueWidget = new GraphWidget({
      title: 'Processing Queue',
      width: 6,
      height: 6,
      region: config.region,
      liveData: true,
      left: [
        new Metric({
          namespace: 'AWS/SQS',
          metricName: 'NumberOfMessagesSent',
          dimensionsMap: { QueueName: refs.pso.queues.incoming.queue.queueName },
          statistic,
          period,
        }),
        new Metric({
          namespace: 'AWS/SQS',
          metricName: 'NumberOfMessagesReceived',
          dimensionsMap: { QueueName: refs.pso.queues.incoming.queue.queueName },
          statistic,
          period,
        }),
        new Metric({
          namespace: 'AWS/SQS',
          metricName: 'ApproximateNumberOfMessagesVisible',
          dimensionsMap: { QueueName: refs.pso.queues.incoming.queue.queueName },
          label: 'Queue Depth',
          statistic,
          period,
        }),
      ],
    });

    const dispatchQueueWidget = new GraphWidget({
      title: 'Dispatch Queue',
      width: 6,
      height: 6,
      region: config.region,
      liveData: true,
      left: [
        new Metric({
          namespace: 'AWS/SQS',
          metricName: 'NumberOfMessagesSent',
          dimensionsMap: { QueueName: refs.pso.queues.dispatch.queue.queueName },
          statistic,
          period,
        }),
        new Metric({
          namespace: 'AWS/SQS',
          metricName: 'NumberOfMessagesReceived',
          dimensionsMap: { QueueName: refs.pso.queues.dispatch.queue.queueName },
          statistic,
          period,
        }),
        new Metric({
          namespace: 'AWS/SQS',
          metricName: 'ApproximateNumberOfMessagesVisible',
          dimensionsMap: { QueueName: refs.pso.queues.dispatch.queue.queueName },
          label: 'Queue Depth',
          statistic,
          period,
        }),
      ],
    });

    const oneSignalWidget = new GraphWidget({
      title: 'Sent to OneSignal per Second',
      width: 5,
      height: 6,
      stacked: true,
      region: config.region,
      left: [
        new Metric({
          namespace: 'global',
          metricName: 'SentToOneSignalComplete',
          label: 'Accepted',
          statistic,
          period,
        }),
      ],
    });

    // Row 2: API | Processed | Dispatched
    const apiGateway4xx = new Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '4XXError',
      dimensionsMap: { ApiName: refs.pso.gateway.restApi.restApiName },
      label: '4XX Error',
      statistic,
      period,
    });

    const apiGateway5xx = new Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '5XXError',
      dimensionsMap: { ApiName: refs.pso.gateway.restApi.restApiName },
      label: '5XX Error',
      statistic,
      period,
      color: '#d62728',
    });

    const apiGatewayCount = new Metric({
      namespace: 'AWS/ApiGateway',
      metricName: 'Count',
      dimensionsMap: { ApiName: refs.pso.gateway.restApi.restApiName },
      label: 'Incoming',
      statistic,
      period,
      color: '#2ca02c',
    });

    const apiGateway2xx = new MathExpression({
      expression: 'm3 - m1 - m2',
      usingMetrics: {
        m1: apiGateway4xx,
        m2: apiGateway5xx,
        m3: apiGatewayCount,
      },
      label: '2xx Response',
      color: '#9467bd',
      period,
    });

    const apiWidget = new GraphWidget({
      title: 'API per Second',
      width: 6,
      height: 6,
      stacked: true,
      region: config.region,
      left: [apiGateway2xx, apiGateway4xx, apiGateway5xx, apiGatewayCount],
    });

    const processedWidget = new GraphWidget({
      title: 'Notifications Processed',
      width: 6,
      height: 6,
      region: config.region,
      liveData: true,
      left: [
        new Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Invocations',
          dimensionsMap: { FunctionName: refs.pso.lambdas.sqs.processing.fn.functionName },
          statistic,
          period,
        }),
        new Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: refs.pso.lambdas.sqs.processing.fn.functionName },
          statistic,
          period,
        }),
      ],
    });

    const dispatchedWidget = new GraphWidget({
      title: 'Notifications Dispatched',
      width: 6,
      height: 6,
      region: config.region,
      liveData: true,
      left: [
        new Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Invocations',
          dimensionsMap: { FunctionName: refs.pso.lambdas.sqs.dispatch.fn.functionName },
          statistic,
          period,
        }),
        new Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: refs.pso.lambdas.sqs.dispatch.fn.functionName },
          statistic,
          period,
        }),
      ],
    });

    // Row 3: PostMessage Lambda Log Group | Processing Lambda Log Group | Dispatch Lambda Log Group
    const postMessageLogWidget = new LogQueryWidget({
      title: 'PostGroupMessage Lambda Log Group',
      width: 6,
      height: 15,
      logGroupNames: [refs.pso.lambdas.http.postMessage.logGroup.logGroupName],
      queryLines: [
        'fields @timestamp, @message',
        'sort @timestamp desc',
        'limit 10000',
        'filter level = "ERROR" OR level = "WARN"',
      ],
      region: config.region,
    });

    const processingLogWidgets = new LogQueryWidget({
      title: 'Processing Lambda Log Group',
      width: 6,
      height: 15,
      logGroupNames: [refs.pso.lambdas.sqs.processing.logGroup.logGroupName],
      queryLines: [
        'fields @timestamp, @message',
        'sort @timestamp desc',
        'limit 10000',
        'filter level = "ERROR" OR level = "WARN"',
      ],
      region: config.region,
    });

    const dispatchLogWidgets = new LogQueryWidget({
      title: 'Dispatch Lambda Log Group',
      width: 6,
      height: 15,
      logGroupNames: [refs.pso.lambdas.sqs.dispatch.logGroup.logGroupName],
      queryLines: [
        'fields @timestamp, @message',
        'sort @timestamp desc',
        'limit 10000',
        'filter level = "ERROR" OR level = "WARN"',
      ],
      region: config.region,
    });

    const dashboard = new Dashboard(this, 'dashboard', {
      dashboardName: config.utils.namingHelper(id),
    });

    dashboard.addWidgets(wafWidget, processingQueueWidget, dispatchQueueWidget, oneSignalWidget);
    dashboard.addWidgets(apiWidget, processedWidget, dispatchedWidget);
    dashboard.addWidgets(postMessageLogWidget, processingLogWidgets, dispatchLogWidgets);
  }
}
