import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSPSOResource } from 'infrastructure/cdk/constructs/UNSPSOResources';

export class UNSPSOUtilization extends Construct {
  constructor(scope: Construct, id: string, config: EnvVars, refs: { pso: UNSPSOResource }) {
    super(scope, id);

    const customNamespace = `NOTIFICATIONS_${config.prefix}`.replace('-', '_').toUpperCase();
    const apiName = refs.pso.gateway.restApi.restApiName;

    const createIncomingMetrics = (period: Duration) => {
      const incoming = new cw.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Count',
        dimensionsMap: { ApiName: apiName, Resource: '/send', Stage: 'api', Method: 'POST' },
        label: 'Incoming',
        statistic: 'Sum',
        period,
      });

      const queuedSuccessfully = new cw.Metric({
        namespace: customNamespace,
        metricName: 'QUEUE_PROCESSING_PUBLISHED_SUCCESSFULLY',
        dimensionsMap: { environment: config.prefix, service: 'NOTIFICATIONS_POSTMESSAGE' },
        label: 'Queued Successfully',
        statistic: 'Sum',
        period,
      });

      const error4xx = new cw.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4XXError',
        dimensionsMap: { ApiName: apiName, Resource: '/send', Stage: 'api', Method: 'POST' },
        label: '4XX Error',
        statistic: 'Sum',
        period,
      });

      const error5xx = new cw.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: { ApiName: apiName, Resource: '/send', Stage: 'api', Method: 'POST' },
        label: '5XX Error',
        statistic: 'Sum',
        period,
      });

      return [incoming, queuedSuccessfully, error4xx, error5xx];
    };

    // Row 1: Minute | Daily | Weekly
    const minuteWidget = new cw.SingleValueWidget({
      title: 'Incoming Notification Totals',
      width: 6,
      height: 7,
      region: config.region,
      sparkline: true,
      start: '-PT1M',
      end: 'P0D',
      metrics: createIncomingMetrics(Duration.seconds(60)),
    });

    const dailyWidget = new cw.SingleValueWidget({
      title: 'Incoming Notification Totals',
      width: 6,
      height: 7,
      region: config.region,
      sparkline: true,
      start: '-PT1M',
      end: 'P0D',
      metrics: createIncomingMetrics(Duration.seconds(86400)),
    });

    const weeklyWidget = new cw.SingleValueWidget({
      title: 'Incoming Notification Totals',
      width: 6,
      height: 7,
      region: config.region,
      sparkline: true,
      start: '-PT1M',
      end: 'P0D',
      metrics: createIncomingMetrics(Duration.seconds(604800)),
    });

    // Row 2: History graph
    const historyWidget = new cw.GraphWidget({
      title: 'History',
      width: 18,
      height: 10,
      stacked: true,
      region: config.region,
      legendPosition: cw.LegendPosition.HIDDEN,
      left: [
        new cw.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'Count',
          dimensionsMap: { ApiName: apiName },
          statistic: 'Sum',
          period: Duration.seconds(60),
        }),
      ],
    });

    const dashboard = new cw.Dashboard(this, 'dashboard', {
      dashboardName: config.utils.namingHelper(id),
    });
    // TODO: Delete this - Used to migrate from JSON to CDK
    dashboard.applyRemovalPolicy(RemovalPolicy.RETAIN);

    dashboard.addWidgets(minuteWidget, dailyWidget, weeklyWidget);
    dashboard.addWidgets(historyWidget);
  }
}
