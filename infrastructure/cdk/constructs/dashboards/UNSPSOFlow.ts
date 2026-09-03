import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSPSOResource } from 'infrastructure/cdk/constructs/UNSPSOResources';

export class UNSPSOFlow extends Construct {
  constructor(scope: Construct, id: string, config: EnvVars, refs: { pso: UNSPSOResource }) {
    super(scope, id);

    const period = Duration.seconds(1);
    const statistic = 'Sum';

    // Row 1: WAF | Processing Queue | Dispatch Queue | OneSignal
    const wafWidget = new cw.GraphWidget({
      title: 'Web App Firewall per Second',
      width: 6,
      height: 6,
      stacked: true,
      region: config.region,
      left: [
        new cw.Metric({
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
        new cw.Metric({
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

    const processingQueueWidget = new cw.GraphWidget({
      title: 'Processing Queue',
      width: 6,
      height: 6,
      region: config.region,
      liveData: true,
      left: [
        new cw.Metric({
          namespace: 'AWS/SQS',
          metricName: 'NumberOfMessagesSent',
          dimensionsMap: { QueueName: refs.pso.queues.incoming.queue.queueName },
          statistic,
          period,
        }),
        new cw.Metric({
          namespace: 'AWS/SQS',
          metricName: 'NumberOfMessagesReceived',
          dimensionsMap: { QueueName: refs.pso.queues.incoming.queue.queueName },
          statistic,
          period,
        }),
        new cw.Metric({
          namespace: 'AWS/SQS',
          metricName: 'ApproximateNumberOfMessagesVisible',
          dimensionsMap: { QueueName: refs.pso.queues.incoming.queue.queueName },
          label: 'Queue Depth',
          statistic,
          period,
        }),
      ],
    });

    const dispatchQueueWidget = new cw.GraphWidget({
      title: 'Dispatch Queue',
      width: 6,
      height: 6,
      region: config.region,
      liveData: true,
      left: [
        new cw.Metric({
          namespace: 'AWS/SQS',
          metricName: 'NumberOfMessagesSent',
          dimensionsMap: { QueueName: refs.pso.queues.dispatch.queue.queueName },
          statistic,
          period,
        }),
        new cw.Metric({
          namespace: 'AWS/SQS',
          metricName: 'NumberOfMessagesReceived',
          dimensionsMap: { QueueName: refs.pso.queues.dispatch.queue.queueName },
          statistic,
          period,
        }),
        new cw.Metric({
          namespace: 'AWS/SQS',
          metricName: 'ApproximateNumberOfMessagesVisible',
          dimensionsMap: { QueueName: refs.pso.queues.dispatch.queue.queueName },
          label: 'Queue Depth',
          statistic,
          period,
        }),
      ],
    });

    const oneSignalWidget = new cw.GraphWidget({
      title: 'Sent to OneSignal per Second',
      width: 5,
      height: 6,
      stacked: true,
      region: config.region,
      left: [
        new cw.Metric({
          namespace: 'global',
          metricName: 'SentToOneSignalComplete',
          label: 'Accepted',
          statistic,
          period,
        }),
      ],
    });

    // Row 2: API | Processed | Dispatched
    const apiGateway4xx = new cw.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '4XXError',
      dimensionsMap: { ApiName: refs.pso.gateway.restApi.restApiName },
      label: '4XX Error',
      statistic,
      period,
    });

    const apiGateway5xx = new cw.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '5XXError',
      dimensionsMap: { ApiName: refs.pso.gateway.restApi.restApiName },
      label: '5XX Error',
      statistic,
      period,
      color: '#d62728',
    });

    const apiGatewayCount = new cw.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: 'Count',
      dimensionsMap: { ApiName: refs.pso.gateway.restApi.restApiName },
      label: 'Incoming',
      statistic,
      period,
      color: '#2ca02c',
    });

    const apiGateway2xx = new cw.MathExpression({
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

    const apiWidget = new cw.GraphWidget({
      title: 'API per Second',
      width: 6,
      height: 6,
      stacked: true,
      region: config.region,
      left: [apiGateway2xx, apiGateway4xx, apiGateway5xx, apiGatewayCount],
    });

    const processedWidget = new cw.GraphWidget({
      title: 'Notifications Processed',
      width: 6,
      height: 6,
      region: config.region,
      liveData: true,
      left: [
        new cw.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Invocations',
          dimensionsMap: { FunctionName: refs.pso.lambdas.sqs.processing.fn.functionName },
          statistic,
          period,
        }),
        new cw.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: refs.pso.lambdas.sqs.processing.fn.functionName },
          statistic,
          period,
        }),
      ],
    });

    const dispatchedWidget = new cw.GraphWidget({
      title: 'Notifications Dispatched',
      width: 6,
      height: 6,
      region: config.region,
      liveData: true,
      left: [
        new cw.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Invocations',
          dimensionsMap: { FunctionName: refs.pso.lambdas.sqs.dispatch.fn.functionName },
          statistic,
          period,
        }),
        new cw.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: refs.pso.lambdas.sqs.dispatch.fn.functionName },
          statistic,
          period,
        }),
      ],
    });

    const dashboard = new cw.Dashboard(this, 'dashboard', {
      dashboardName: config.utils.namingHelper(id),
    });
    // TODO: Delete this - Used to migrate from JSON to CDK
    dashboard.applyRemovalPolicy(RemovalPolicy.RETAIN);

    dashboard.addWidgets(wafWidget, processingQueueWidget, dispatchQueueWidget, oneSignalWidget);
    dashboard.addWidgets(apiWidget, processedWidget, dispatchedWidget);
  }
}
