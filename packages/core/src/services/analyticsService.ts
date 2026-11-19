import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { NotificationStateEnum } from '@common/models';
import { AnalyticsQueueService } from '@common/services/analyticsQueueService';
import { CacheService } from '@common/services/cacheService';
import { MetricsLabels, ObservabilityService, prefixEvent } from '@common/services/observabilityService';
import { IIdentifiableMessage } from '@common/models/interfaces';

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
    this.observability.logger.info(`Events`, { count: messages.length, status });

    await this.publishWithoutThrowing(status, messages.length, () => {
      const events = messages.map((event, index) =>
        this.createEvent<T>(event, status, reasons ? reasons[index] : undefined)
      );
      return [...events.map((event) => this.cacheAnalyticsEvent(event)), this.queue.publishMessageBatch(events)];
    });
  }

  public async publishEvent<T>(message: AnalyticsEventFromIMessage, status: NotificationStateEnum, reason?: T) {
    await this.publishWithoutThrowing(status, 1, () => {
      const event = this.createEvent(message, status, reason);
      return [this.cacheAnalyticsEvent(event), this.queue.publishMessage(event)];
    });
  }

  /**
   * Analytics must never fail the caller: a handler retrying (or failing a request) because an analytics event could not
   * be recorded costs more than the lost event. Every publish is allowed to finish (so none is left running after the
   * caller moves on) and each distinct failure is logged. Failures are also counted in the ANALYTICS_PUBLISH_FAILED
   * metric so an outage can still be alarmed on.
   */
  private async publishWithoutThrowing(
    status: NotificationStateEnum,
    count: number,
    startPublishes: () => Promise<unknown>[]
  ) {
    const errors: unknown[] = [];
    try {
      const results = await Promise.allSettled(startPublishes());
      for (const result of results) {
        if (result.status === 'rejected') {
          errors.push(result.reason);
        }
      }
    } catch (error) {
      // Starting the publishes failed (e.g. an event could not be built)
      errors.push(error);
    }

    if (errors.length === 0) {
      this.addAnalyticsEventMetricCount(status, count);
      return;
    }

    this.observability.metrics.addMetric(MetricsLabels.ANALYTICS_PUBLISH_FAILED, MetricUnit.Count, count);
    this.observability.logger.error('Failed to publish analytics events, continuing', {
      status,
      count,
      failedOperations: errors.length,
      errors: [...new Set(errors.map((error) => JSON.stringify(this.observability.formatError(error))))],
    });
  }

  private async cacheAnalyticsEvent(event: AnalyticsEvent) {
    await this.cache.appendToList(this.cache.analyticsEventKey(event.NotificationID), event, 10 * 60);
  }
}
