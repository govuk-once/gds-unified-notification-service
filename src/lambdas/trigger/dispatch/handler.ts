import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import {
  iocGetAnalyticsQueueService,
  iocGetConfigurationService,
  iocGetInboundDynamoRepository,
  iocGetLogger,
  iocGetMetrics,
  iocGetNotificationService,
  iocGetTracer,
} from '@common/ioc';
import { QueueEvent, QueueHandler } from '@common/operations';
import { ConfigurationService, NotificationService } from '@common/services';
import { groupValidation } from '@common/utils';
import { IProcessedMessage, IProcessedMessageSchema } from '@project/lambdas/interfaces/IProcessedMessage';
import { Context } from 'aws-lambda';
import { v4 as uuid } from 'uuid';

export class Dispatch extends QueueHandler<unknown, void> {
  public operationId: string = 'dispatch';

  constructor(
    protected config: ConfigurationService,
    logger: Logger,
    metrics: Metrics,
    tracer: Tracer,
    protected notificationService: NotificationService
  ) {
    super(logger, metrics, tracer);
  }

  public async implementation(event: QueueEvent<IProcessedMessage>, context: Context) {
    try {
      // Initialize services -  TODO: Shift this into IOC
      await this.notificationService.initialize();
      // Create a record of message in Dynamodb
      const messageRecordTable = await iocGetInboundDynamoRepository();

      // (MOCK) Send event to events queue
      const analyticsQueue = await iocGetAnalyticsQueueService();

      // Segregate inputs - parse all, group by result, for invalid records - parse using partial approach to extract valid fields
      const [records, validRecords, invalidRecords] = groupValidation(
        event.Records.map((record) => record.body),
        IProcessedMessageSchema
      );

      // A single invalid entry rejects entire batch - these are messages from within the system this should not happen
      if (invalidRecords.length > 0) {
        this.logger.error(`Invalid elements detected within the SQS Message, rejecting entire set`, {
          invalidRecords: invalidRecords.map((record) => record.raw),
          totalRecords: records,
        });
      }

      // Process the notification requests
      for (const { valid } of validRecords) {
        const metadata = {
          NotificationID: valid.NotificationID,
          DepartmentID: valid.DepartmentID,
        };
        const { requestId, success } = await this.notificationService.send({
          ExternalUserID: valid.ExternalUserID,
          NotificationID: valid.NotificationID,
          NotificationTitle: valid.NotificationTitle,
          NotificationBody: valid.NotificationBody,
        });
        if (success) {
          this.logger.info(`Notification dispatched`, { ...metadata, ProviderRequestID: requestId });

          await analyticsQueue.publishMessage({
            NotificationID: valid.NotificationID,
            DepartmentID: valid.DepartmentID,
            // TODO: Instead of APIGWEvent we may need SQS Event ID
            APIGWExtendedID: uuid(),
            EventDateTime: new Date().toISOString(),
            Event: 'SUCCESS',
            Message: '',
          });
        } else {
          this.logger.error(`Notification failed to dispatch`, { ...metadata });
        }
      }
    } catch (error) {
      this.logger.error('Unexpected error', { error });
    }
  }
}

export const handler = new Dispatch(
  iocGetConfigurationService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer(),
  iocGetNotificationService()
).handler();
