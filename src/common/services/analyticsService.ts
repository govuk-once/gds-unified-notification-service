import { MetricUnit } from '@aws-lambda-powertools/metrics';
import type { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { AnalyticsQueueService, MetricsLabels, ObservabilityService, prefixEvent } from '@common/services';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { v4 as uuid } from 'uuid';

export type AnalyticsEventFromIMessage = Pick<IMessage, 'DepartmentID' | 'NotificationID' | 'CampaignID'> & {
  APIGWExtendedID?: string;
};

export class AnalyticsService {
  constructor(
    public observability: ObservabilityService,
    public queue: AnalyticsQueueService
  ) {}

  public addPublishingResultMetric(success: boolean, count: number) {
    if (success) {
      this.observability.metrics.addMetric(
        MetricsLabels.QUEUE_ANALYTICS_PUBLISHED_SUCCESSFULLY,
        MetricUnit.Count,
        count
      );
    }
    this.observability.metrics.addMetric(MetricsLabels.QUEUE_ANALYTICS_PUBLISHED_FAILED, MetricUnit.Count, count);
  }

  private addAnalyticsEventMetricCount(status: NotificationStateEnum, value: number) {
    // Adds a metric to count all analytics events triggered
    const analyticsEventMetricLabel = MetricsLabels[prefixEvent(status) as keyof typeof MetricsLabels];

    // Defensive if statement - should not be needed as MetricsLabels is linked to NotificationStateEnum
    if (analyticsEventMetricLabel in MetricsLabels) {
      this.observability.metrics.addMetric(analyticsEventMetricLabel, MetricUnit.Count, value);
    } else {
      this.observability.logger.warn('Analytics Event was not defined in Metrics Label');
    }
  }

  public createEvent<T>(message: AnalyticsEventFromIMessage, status: NotificationStateEnum, reason?: T) {
    return {
      EventID: uuid(),
      NotificationID: message.NotificationID,
      DepartmentID: message.DepartmentID,
      CampaignID: message.CampaignID,
      APIGWExtendedID: message.APIGWExtendedID,
      EventDateTime: new Date().toISOString(),
      Event: status,
      EventReason: reason ? JSON.stringify(reason) : undefined,
    };
  }

  public async publishMultipleEvents<T>(
    events: AnalyticsEventFromIMessage[],
    status: NotificationStateEnum,
    reasons?: T[]
  ) {
    // Ignore empty arrays
    if (events.length == 0) {
      return;
    }

    // Map events & reasons together based on index (expecting two arrays of same length)
    this.observability.logger.info(`Events`, JSON.stringify(events));
    await this.queue.publishMessageBatch(
      events.map((event, index) => this.createEvent<T>(event, status, reasons ? reasons[index] : undefined))
    );

    this.addAnalyticsEventMetricCount(status, events.length);
  }

  public async publishEvent<T>(message: AnalyticsEventFromIMessage, status: NotificationStateEnum, reason?: T) {
    await this.queue.publishMessage(this.createEvent(message, status, reason));
    this.addAnalyticsEventMetricCount(status, 1);
  }
}
