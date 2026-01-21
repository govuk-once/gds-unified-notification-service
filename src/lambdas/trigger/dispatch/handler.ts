import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import {
  iocGetConfigurationService,
  iocGetLogger,
  iocGetMetrics,
  iocGetNotificationService,
  iocGetQueueService,
  iocGetTracer,
} from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { NotificationService } from '@common/services';
import { Configuration } from '@common/services/configuration';
import { StringParameters } from '@common/utils/parameters';
import { Context } from 'aws-lambda';

interface MockNotificationRequestMessage {
      ExternalUserID: string,
      NotificationID: string,
      NotificationTitle: string,
      NotificationBody: string,
}

export class Dispatch extends QueueHandler<unknown, void> {
  public operationId: string = 'dispatch';

  constructor(
    protected config: Configuration,
    logger: Logger,
    metrics: Metrics,
    tracer: Tracer,
    protected notificationService: NotificationService
  ) {
    super(logger, metrics, tracer);
  }

  public async implementation(event: QueueEvent<MockNotificationRequestMessage>, context: Context) {
    this.logger.info('Received request.', { event });

    // (MOCK) Send completed message to push notification endpoint
    this.logger.info('Message sent.');
    this.logger.info('Completed request.');

    // Initialize
    await this.notificationService.initialize();

    await this.notificationService.send({
      
      ExternalUserID: event.Records[0].body.ExternalUserID,
      NotificationID: event.Records[0].body.NotificationID,
      NotificationTitle: event.Records[0].body.NotificationTitle,
      NotificationBody: event.Records[0].body.NotificationBody,
    });

    // (MOCK) Send event to events queue
    const analyticsQueueUrl = (await this.config.getParameter(StringParameters.Queue.Analytics.Url)) ?? '';

    const analyticsQueue = iocGetQueueService(analyticsQueueUrl);
    await analyticsQueue.publishMessage('Test message body.');
  }
}

export const handler = new Dispatch(
  iocGetConfigurationService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer(),
  iocGetNotificationService()
).handler();
