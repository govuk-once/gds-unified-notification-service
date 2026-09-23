import { MetricsLabels } from '@common/services';
import { Duration } from 'aws-cdk-lib';
import { Dashboard, GraphWidget, LogQueryWidget, Metric } from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSPSOResource } from 'infrastructure/cdk/constructs/UNSPSOResources';

export class UNSPSOGroupFlow extends Construct {
  private createMetric(metricName: string, label: string, config: EnvVars) {
    const period = Duration.seconds(1);
    const statistic = 'Sum';

    return new Metric({
      namespace: config.metrics.customNamespace,
      metricName,
      dimensionsMap: { environment: config.prefix, service: config.metrics.psoService },
      label,
      statistic,
      period,
    });
  }

  constructor(scope: Construct, id: string, config: EnvVars, refs: { pso: UNSPSOResource }) {
    super(scope, id);

    // Row 1: Group Processing Worker Started | Group Processing Worker Completed | Group Processing Worker Failed
    const workerStartedWidget = new GraphWidget({
      title: 'Group Processing Worker Started',
      width: 6,
      height: 6,
      stacked: true,
      region: config.region,
      left: [
        this.createMetric(MetricsLabels.GROUP_PROCESSING_WORKER_STARTED, 'Group Processing Worker Started', config),
      ],
    });

    const workerEndedWidget = new GraphWidget({
      title: 'Group Processing Worker Completed',
      width: 6,
      height: 6,
      stacked: true,
      region: config.region,
      left: [
        this.createMetric(MetricsLabels.GROUP_PROCESSING_WORKER_COMPLETED, 'Group Processing Worker Completed', config),
      ],
    });

    const workerFailedWidget = new GraphWidget({
      title: 'Group Processing Worker Failed',
      width: 6,
      height: 6,
      stacked: true,
      region: config.region,
      left: [this.createMetric(MetricsLabels.GROUP_PROCESSING_WORKER_FAILED, 'Group Processing Worker Failed', config)],
    });

    // Row 2: Batch Item Failures | Group Processing Queue Published Successfully | Group Processing Queue Publishing Failed
    const batchItemFailuresWidget = new GraphWidget({
      title: 'Batch Item Failures For Group Processing',
      width: 6,
      height: 6,
      stacked: true,
      region: config.region,
      left: [this.createMetric(MetricsLabels.BATCH_ITEM_FAILURES_GROUP_PROCESSING, 'Batch Item Failures', config)],
    });

    const publishedSuccessfullyWidget = new GraphWidget({
      title: 'Group Processing Queue Published Successfully',
      width: 6,
      height: 6,
      stacked: true,
      region: config.region,
      left: [
        this.createMetric(
          MetricsLabels.QUEUE_GROUP_PROCESSING_PUBLISHED_SUCCESSFULLY,
          'Group Processing Queue Published Successfully',
          config
        ),
      ],
    });

    const publishingFailedWidget = new GraphWidget({
      title: 'Group Processing Queue Publishing Failed',
      width: 6,
      height: 6,
      stacked: true,
      region: config.region,
      left: [
        this.createMetric(
          MetricsLabels.QUEUE_GROUP_PROCESSING_PUBLISHED_FAILED,
          'Group Processing Queue Publishing Failed',
          config
        ),
      ],
    });

    const dashboard = new Dashboard(this, 'group-flow-dashboard', {
      dashboardName: config.utils.namingHelper(id),
    });

    dashboard.addWidgets(workerStartedWidget, workerEndedWidget, workerFailedWidget);
    dashboard.addWidgets(batchItemFailuresWidget, publishedSuccessfullyWidget, publishingFailedWidget);

    // Row 3: PostGroupMessage Lambda Log Group | GroupProcessingWorker Lambda Log Group
    if (refs.pso.lambdas.http.postGroupMessage && refs.pso.lambdas.sqs.groupProcessingWorker?.logGroup.logGroupName) {
      const postGroupMessageLogWidget = new LogQueryWidget({
        title: 'PostGroupMessage Lambda Log Group',
        width: 6,
        height: 15,
        logGroupNames: [refs.pso.lambdas.http.postGroupMessage?.logGroup.logGroupName],
        queryLines: [
          'fields @timestamp, @message',
          'sort @timestamp desc',
          'limit 10000',
          'filter level = "ERROR" OR level = "WARN"',
        ],
        region: config.region,
      });

      const groupProcessingWorkerLogWidgets = new LogQueryWidget({
        title: 'GroupProcessingWorker Lambda Log Group',
        width: 6,
        height: 15,
        logGroupNames: [refs.pso.lambdas.sqs.groupProcessingWorker?.logGroup.logGroupName],
        queryLines: [
          'fields @timestamp, @message',
          'sort @timestamp desc',
          'limit 10000',
          'filter level = "ERROR" OR level = "WARN"',
        ],
        region: config.region,
      });

      dashboard.addWidgets(postGroupMessageLogWidget, groupProcessingWorkerLogWidgets);
    }
  }
}
