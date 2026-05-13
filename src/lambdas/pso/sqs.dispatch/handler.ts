import { BatchProcessor, EventType, processPartialResponse } from '@aws-lambda-powertools/batch';
import { PartialItemFailureResponse } from '@aws-lambda-powertools/batch/types';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  HandlerDependencies,
  iocGetAnalyticsService,
  iocGetCacheService,
  iocGetCircuitBreakerService,
  iocGetConfigurationService,
  iocGetNotificationDynamoRepository,
  iocGetNotificationService,
  iocGetObservabilityService,
} from '@common/ioc';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { QueueEvent } from '@common/operations';
import { BatchQueueOperation } from '@common/operations/batchQueueOperation';
import { NotificationsDynamoRepository } from '@common/repositories';
import {
  AnalyticsService,
  CacheService,
  CircuitBreakerService,
  ConfigurationService,
  MetricsLabels,
  NotificationService,
  ObservabilityService,
} from '@common/services';
import { BoolParameters, NumericParameters } from '@common/utils';
import { extractIdentifiers, IMessage } from '@project/lambdas/interfaces/IMessage';
import { IProcessedMessage, ISQSProcessedMessageSchema } from '@project/lambdas/interfaces/IProcessedMessage';
import { Context, SQSRecord } from 'aws-lambda';
import z from 'zod';

/**
 * 
 * Lambda handling processing of validated messages
 * - Validates input 
 * - Performs a user ID look up
 * - Fires analytics events: PROCESSING, PROCESSED, PROCESSING_FAILED
 * - Pushes valid messages into dispatch queue
 * 
 * Sample event:
{
  "Records": [
    {
      "messageId": "mockMessageId",
      "receiptHandle": "mockReceiptHandle",
      "body": "{\"NotificationID\":\"337f6248-ed5b-4b73-be0b-4e9a2f8636e0\",\"DepartmentID\":\"DEP01\",\"UserID\":\"test_id_01\",\"ExternalUserID\":\"test_id_01\",\"MessageTitle\":\"MOCK_LONG_TITLE\",\"MessageBody\":\"MOCK_LONG_MESSAGE\",\"NotificationTitle\":\"Hey\",\"NotificationBody\":\"You have a new message in the message center.\"}",
      "attributes": {
        "ApproximateReceiveCount": "2",
        "SentTimestamp": "202601021513",
        "SenderId": "mockSenderId",
        "ApproximateFirstReceiveTimestamp": "202601021513"
      },
      "messageAttributes": {},
      "md5OfBody": "{{{md5_of_body}}}",
      "eventSource": "aws:sqs",
      "eventSourceARN": "arn:aws:sqs:us-east-1:123456789012:MyQueue",
      "awsRegion": "us-east-1"
    }
  ]
}
 */
const DISPATCH_PLATFORM_KEY = 'notification_dispatch';

export class Dispatch extends BatchQueueOperation<IProcessedMessage, PartialItemFailureResponse> {
  public operationId: string = 'dispatch';

  public notificationsDynamoRepository: NotificationsDynamoRepository;
  public analyticsService: AnalyticsService;
  public notificationsService: NotificationService;
  public cacheService: CacheService;
  public circuitBreakerService: CircuitBreakerService;

  constructor(
    public config: ConfigurationService,
    observability: ObservabilityService,
    dependencies?: () => HandlerDependencies<Dispatch>
  ) {
    super(config, observability);
    this.injectDependencies(dependencies);
  }

  public recordHandler = async (record: SQSRecord) => {
    await this.circuitBreakerService.checkCircuit();

    // Validate Incoming messages
    const data = await this.validateRecord(ISQSProcessedMessageSchema, record, {
      onIdentified: async (identifiableRecord) => {
        await this.analyticsService.publishEvent(identifiableRecord, NotificationStateEnum.DISPATCHING);
      },
      onSuccess: (record) => {
        this.observability.logger.info(`Message was successfully parsed`, record.body.NotificationID);
      },
      onError: async (identifiableRecord, validationError) => {
        const errorMsg = validationError ? z.prettifyError(validationError) : {};
        this.observability.logger.error(`Failed to parse message`, errorMsg);
        await this.analyticsService.publishEvent(
          {
            NotificationID: identifiableRecord.NotificationID,
            DepartmentID: identifiableRecord.DepartmentID,
          },
          NotificationStateEnum.DISPATCHING_FAILED,
          errorMsg
        );
      },
    });
    const message = data.body;

    // Rate limits request if rate limiting is enforced
    if (
      (
        await this.cacheService.rateLimit(
          `NOTIFICATION_PROVIDER_RATE_LIMIT`,
          await this.config.getNumericParameter(
            NumericParameters.Config.Dispatch.NotificationsProviderRateLimitPerMinute
          )
        )
      ).exceeded
    ) {
      throw new Error(`Stopping processing from continuing as rate limit has been exceeded`);
    }

    // Prepare request
    try {
      const result = await this.circuitBreakerService.use(async () => {
        const result = await this.notificationsService.send({
          ExternalUserID: message.ExternalUserID,
          NotificationID: message.NotificationID,
          NotificationTitle: message.NotificationTitle,
          NotificationBody: message.NotificationBody,
        });
        if (result.success) {
          return result;
        }

        if (result.errors) {
          throw new Error(JSON.stringify(result.errors));
        }
        throw new Error('Request to notification provider failed with no error message');
      });

      this.observability.logger.info(`Notification dispatched`, {
        NotificationID: message.NotificationID,
        DepartmentID: message.DepartmentID,
        ProviderRequestID: result.result?.requestId,
      });
      await this.analyticsService.publishEvent(extractIdentifiers(message), NotificationStateEnum.DISPATCHED);
    } catch (error) {
      this.observability.logger.error(`Notification failed to dispatch`, {
        NotificationID: message.NotificationID,
        DepartmentID: message.DepartmentID,
      });
      await this.analyticsService.publishEvent(extractIdentifiers(message), NotificationStateEnum.DISPATCHING_FAILED);

      throw error;
    }

    // Update stored record with timestamp - also reset expiration date
    await this.notificationsDynamoRepository.updateRecord(
      {
        ...extractIdentifiers(message),
        DispatchedDateTime: new Date().toISOString(),
      },
      { resetExpirationDate: true }
    );

    // Increment rate limiter post request
    await this.cacheService.rateLimit(
      `NOTIFICATION_PROVIDER_RATE_LIMIT`,
      await this.config.getNumericParameter(NumericParameters.Config.Dispatch.NotificationsProviderRateLimitPerMinute),
      1
    );
  };

  public async implementation(
    event: QueueEvent<IProcessedMessage>,
    context: Context
  ): Promise<PartialItemFailureResponse> {
    await this.config.ensureServiceIsEnabled(
      BoolParameters.Config.Common.Enabled,
      BoolParameters.Config.Dispatch.Enabled
    );

    const processor = new BatchProcessor(EventType.SQS);
    const failures = await processPartialResponse(event, this.recordHandler, processor, {
      context,
    });

    if (failures.batchItemFailures.length > 0) {
      this.observability.metrics.addMetric(
        MetricsLabels.BATCH_ITEM_FAILURES_DISPATCH,
        MetricUnit.Count,
        failures.batchItemFailures.length
      );
    }
    return failures;
  }
}

export const handler = new Dispatch(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  notificationsDynamoRepository: iocGetNotificationDynamoRepository(),
  notificationsService: iocGetNotificationService(),
  analyticsService: iocGetAnalyticsService(),
  cacheService: iocGetCacheService().connect(),
  circuitBreakerService: iocGetCircuitBreakerService(DISPATCH_PLATFORM_KEY),
})).handler();
