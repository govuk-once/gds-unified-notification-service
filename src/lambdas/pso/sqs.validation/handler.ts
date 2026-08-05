import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  HandlerDependencies,
  iocGetAnalyticsService,
  iocGetConfigurationService,
  iocGetContentValidationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
  iocGetProcessingQueueService,
} from '@common/ioc';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { BatchQueueOperation } from '@common/operations/batchQueueOperation';
import { NotificationsDynamoRepository } from '@common/repositories';
import {
  AnalyticsService,
  ConfigurationService,
  MetricsLabels,
  ObservabilityService,
  ProcessingQueueService,
} from '@common/services';
import { BoolParameters } from '@common/utils';
import { IIdentifiableMessage, IMessageSchema } from '@project/lambdas/interfaces/IMessage';
import { SQSRecord } from 'aws-lambda';

const requestBodySchema = IMessageSchema;

export class Validation extends BatchQueueOperation<typeof requestBodySchema> {
  public operationId: string = 'validation';
  protected enableConfig: string = BoolParameters.Config.Validation.Enabled;
  public requestBodySchema = requestBodySchema;

  public analyticsService: AnalyticsService;
  public notificationsRepository: NotificationsDynamoRepository;
  public processingQueue: ProcessingQueueService;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<Validation>
  ) {
    super(config, observability);
    this.injectDependencies(asyncDependencies);
  }

  public recordHandler = async (record: SQSRecord) => {
    const start = performance.now();

    // Validate Incoming messages
    const data = await this.validateRecord(record);
    const message = data.body;

    if (!message.OrganisationID) {
      throw new Error(
        `OrganisationID is missing from ${message.NotificationID}. It must be stamped from the mTLS certificate.`
      );
    }

    // Pre-validate message & reject request when one of them contains unsupported url or invalid markdown
    this.contentValidationService!.validate(message.MessageBody);

    this.observability.metrics.addMetric(
      MetricsLabels.VALIDATION_DURATION,
      MetricUnit.Milliseconds,
      performance.now() - start
    );

    await this.notificationsRepository.createRecord({
      ...message,
      OrganisationID: message.OrganisationID,
      ReceivedDateTime: data.attributes.ApproximateFirstReceiveTimestamp,
      ValidatedDateTime: new Date().toISOString(),
      Events: [],
    });

    // Publish analytics
    await this.analyticsService.publishEvent(message, NotificationStateEnum.VALIDATED);

    // Publish messages to the next stage
    await this.processingQueue.publishMessage(message);
  };

  protected async onStart(identifiableRecord: IIdentifiableMessage): Promise<void> {
    await this.analyticsService.publishEvent(identifiableRecord, NotificationStateEnum.VALIDATING);
  }

  protected async onError(identifiableRecord: IIdentifiableMessage, error: unknown): Promise<void> {
    await this.analyticsService.publishEvent(
      identifiableRecord,
      NotificationStateEnum.VALIDATION_FAILED,
      this.observability.formatError(error)
    );
  }

  protected async onSuccess(identifiableRecord: IIdentifiableMessage): Promise<void> {
    await this.analyticsService.publishEvent(identifiableRecord, NotificationStateEnum.VALIDATED);
  }

  protected batchItemFailureMetric(batchItemFailuresCount: number) {
    this.observability.metrics.addMetric(
      MetricsLabels.BATCH_ITEM_FAILURES_VALIDATION,
      MetricUnit.Count,
      batchItemFailuresCount
    );
  }
}

export const handler = new Validation(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  analyticsService: iocGetAnalyticsService(),
  contentValidationService: iocGetContentValidationService(),
  notificationsRepository: iocGetNotificationDynamoRepository(),
  processingQueue: iocGetProcessingQueueService(),
})).handler();
