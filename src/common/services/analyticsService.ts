import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { AnalyticsQueueService } from '@common/services';
import { Observability } from '@common/utils/observability';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { v4 as uuid } from 'uuid';

export type AnalyticsEventFromIMessage = Pick<IMessage, 'DepartmentID' | 'NotificationID'> & {
  APIGWExtendedID?: string;
};

export class AnalyticsService {
  constructor(
    public observability: Observability,
    public queue: AnalyticsQueueService
  ) {}

  protected createEvent<T>(message: AnalyticsEventFromIMessage, status: ValidationEnum, reason?: T) {
    return {
      EventID: uuid(),
      NotificationID: message.NotificationID,
      DepartmentID: message.DepartmentID,
      APIGWExtendedID: message.APIGWExtendedID,
      EventDateTime: new Date().toISOString(),
      Event: status,
      EventReason: reason ? JSON.stringify(reason) : undefined,
    };
  }

  public async publishMultipleEvents<T>(events: AnalyticsEventFromIMessage[], status: ValidationEnum, reasons?: T[]) {
    // Ignore empty arrays
    if (events.length == 0) {
      return;
    }

    // Map events & reasons together based on index (expecting two arrays of same length)
    await this.queue.publishMessageBatch(
      events.map((event, index) => this.createEvent<T>(event, status, reasons ? reasons[index] : undefined))
    );

    this.observability.metrics.addMetric(`ANALYTIC_EVENTS_${status.toUpperCase()}`, MetricUnit.Count, events.length);
  }

  public async publishEvent<T>(message: AnalyticsEventFromIMessage, status: ValidationEnum, reason?: T) {
    await this.queue.publishMessage(this.createEvent(message, status, reason));
    this.observability.metrics.addMetric(`ANALYTIC_EVENTS_${status.toUpperCase()}`, MetricUnit.Count, 1);
  }
}
