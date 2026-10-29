import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { NotificationStateEnum } from '@common/models';
import { AnalyticsQueueService } from '@common/services/analyticsQueueService';
import { CacheService } from '@common/services/cacheService';
import { MetricsLabels, ObservabilityService, prefixEvent } from '@common/services/observabilityService';
import { IIdentifiableMessage } from '@project/lambdas';

import { v4 as uuid } from 'uuid';

export type AnalyticsEventFromIMessage = Pick<
  IIdentifiableMessage,
  'DepartmentID' | 'OrganisationID' | 'NotificationID' | 'CampaignID'
> & {
  APIGWExtendedID?: string;
};

type AnalyticsEvent = {
  EventID: string;
  NotificationID: string;
  DepartmentID?: string;
  OrganisationID: string;
  CampaignID?: string;
  APIGWExtendedID?: string;
  EventDateTime: string;
  Event: string;
  EventReason?: string;
};

export class AnalyticsService {
  constructor(
    public cache: CacheService,
    public observability: ObservabilityService,
    public queue: AnalyticsQueueService
  ) {}

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

  public createEvent<T>(
    message: AnalyticsEventFromIMessage,
    status: NotificationStateEnum,
    reason?: T
  ): AnalyticsEvent {
    return {
      EventID: uuid(),
      NotificationID: message.NotificationID,
      DepartmentID: message.DepartmentID,
      OrganisationID: message.OrganisationID,
      CampaignID: message.CampaignID,
      APIGWExtendedID: message.APIGWExtendedID,
      EventDateTime: new Date().toISOString(),
      Event: status,
      EventReason: reason ? JSON.stringify(reason) : undefined,
    };
  }

  public async publishMultipleEvents<T>(
    messages: AnalyticsEventFromIMessage[],
    status: NotificationStateEnum,
    reasons?: T[]
  ) {
    // Ignore empty arrays
    if (messages.length == 0) {
      return;
    }

    // Map events & reasons together based on index (expecting two arrays of same length)
    this.observability.logger.info(`Events`, { events: messages });

    const events = messages.map((event, index) =>
      this.createEvent<T>(event, status, reasons ? reasons[index] : undefined)
    );
    for (const event of events) {
      await this.cacheAnalyticsEvent(event);
    }
    await this.queue.publishMessageBatch(events);

    this.addAnalyticsEventMetricCount(status, events.length);
  }

  public async publishEvent<T>(message: AnalyticsEventFromIMessage, status: NotificationStateEnum, reason?: T) {
    const event = this.createEvent(message, status, reason);
    await this.cacheAnalyticsEvent(event);
    await this.queue.publishMessage(event);
    this.addAnalyticsEventMetricCount(status, 1);
  }

  private async cacheAnalyticsEvent(event: AnalyticsEvent) {
    await this.cache.appendToList(this.cache.analyticsEventKey(event.NotificationID), event, 10 * 60);
  }
}
