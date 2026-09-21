import { Duration } from 'aws-cdk-lib';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';

export class UNSPSOGroupFlow extends Construct {
  constructor(scope: Construct, id: string, config: EnvVars) {
    super(scope, id);

    const period = Duration.seconds(1);
    const statistic = 'Sum';
    const namespace = `NOTIFICATIONS_${config.prefix}`.replace('-', '_').toUpperCase();

    // Row 1: Group Processing Worker Started | Group Processing Worker Completed | Group Processing Worker Failed
    const workerStartedWidget = new cw.GraphWidget({
      title: 'Group Processing Worker Started',
      width: 6,
      height: 6,
      stacked: true,
      region: config.region,
      left: [
        new cw.Metric({
          namespace,
          metricName: 'GROUP_PROCESSING_WORKER_STARTED',
          dimensionsMap: { environment: config.prefix, service: 'NOTIFICATIONS_PSO' },
          label: 'Group Processing Worker Started',
          statistic,
          period,
        }),
      ],
    });

    const workerEndedWidget = new cw.GraphWidget({
      title: 'Group Processing Worker Completed',
      width: 6,
      height: 6,
      stacked: true,
      region: config.region,
      left: [
        new cw.Metric({
          namespace,
          metricName: 'GROUP_PROCESSING_WORKER_COMPLETED',
          dimensionsMap: { environment: config.prefix, service: 'NOTIFICATIONS_PSO' },
          label: 'Group Processing Worker Completed',
          statistic,
          period,
        }),
      ],
    });

    const workerFailedWidget = new cw.GraphWidget({
      title: 'Group Processing Worker Failed',
      width: 6,
      height: 6,
      stacked: true,
      region: config.region,
      left: [
        new cw.Metric({
          namespace,
          metricName: 'GROUP_PROCESSING_WORKER_FAILED',
          dimensionsMap: { environment: config.prefix, service: 'NOTIFICATIONS_PSO' },
          label: 'Group Processing Worker Failed',
          statistic,
          period,
        }),
      ],
    });

    // Row 2: Batch Item Failures | Group Processing Queue Published Successfully | Group Processing Queue Publishing Failed
    const batchItemFailuresWidget = new cw.GraphWidget({
      title: 'Batch Item Failures For Group Processing',
      width: 6,
      height: 6,
      stacked: true,
      region: config.region,
      left: [
        new cw.Metric({
          namespace: namespace,
          metricName: 'BATCH_ITEM_FAILURES_GROUP_PROCESSING',
          dimensionsMap: { environment: config.prefix, service: 'NOTIFICATIONS_PSO' },
          label: 'Batch Item Failures',
          statistic,
          period,
        }),
      ],
    });

    const publishedSuccessfullyWidget = new cw.GraphWidget({
      title: 'Group Processing Queue Published Successfully',
      width: 6,
      height: 6,
      stacked: true,
      region: config.region,
      left: [
        new cw.Metric({
          namespace: namespace,
          metricName: 'QUEUE_GROUP_PROCESSING_PUBLISHED_SUCCESSFULLY',
          dimensionsMap: { environment: config.prefix, service: 'NOTIFICATIONS_PSO' },
          label: 'Group Processing Queue Published Successfully',
          statistic,
          period,
        }),
      ],
    });

    const publishingFailedWidget = new cw.GraphWidget({
      title: 'Group Processing Queue Publishing Failed',
      width: 6,
      height: 6,
      stacked: true,
      region: config.region,
      left: [
        new cw.Metric({
          namespace: namespace,
          metricName: 'BATCH_ITEM_FAILURES_GROUP_PROCESSING',
          dimensionsMap: { environment: config.prefix, service: 'NOTIFICATIONS_PSO' },
          label: 'Group Processing Queue Publishing Failed',
          statistic,
          period,
        }),
      ],
    });

    const dashboard = new cw.Dashboard(this, 'dashboard', {
      dashboardName: config.utils.namingHelper(id),
    });

    dashboard.addWidgets(workerStartedWidget, workerEndedWidget, workerFailedWidget);
    dashboard.addWidgets(batchItemFailuresWidget, publishedSuccessfullyWidget, publishingFailedWidget);
  }
}
