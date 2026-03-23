import {
  APIHandler,
  defineContract,
  HandlerDependencies,
  IAPIContractEvent,
  IAPIContractResponse,
  iocGetAnalyticsService,
  iocGetConfigurationService,
  iocGetContentValidationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
  iocGetProcessingQueueService,
} from '@common';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { NotificationsDynamoRepository } from '@common/repositories';
import {
  AnalyticsEventFromIMessage,
  AnalyticsService,
  ConfigurationService,
  ContentValidationService,
  ObservabilityService,
  ProcessingQueueService,
} from '@common/services';
import { PostMessageBodyItem } from '@generated/pso';
import { IMessageSchema } from '@project/lambdas/interfaces/IMessage';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import type { Context } from 'aws-lambda';
import z from 'zod';

/**
 * Lambda handling incoming messages from a api request
 * - Validates input against zod schema
 *   - Stores messages into notifications dynamodb
 * - Fires analytics events
 * - Pushes messages into processing queue
 * 
 * Sample event received by Lambda from API Gateway
{
  "body":"[{\"NotificationID\":\"200f6248-ed5b-4b73-be0b-4e9a2f8636e0\",\"DepartmentID\":\"DEP01\",\"UserID\":\"USER_ID\",\"MessageTitle\":\"You have a new Message\",\"MessageBody\":\"Open Notification Centre to read your notifications\",\"NotificationTitle\":\"You have a new Notification\",\"NotificationBody\":\"Here is the Notification body.\"}]",
  "headers": {
    "x-api-key": "mockApiKey",
    "Content-Type": "application/json"
  },
  "requestContext": {
    "requestId": "c6af9ac6-7b61-11e6-9a41-93e8deadbeef",
    "requestTimeEpoch": 1428582896000
  }
}
* Sample post body:
    {
      "NotificationID": "200f6248-ed5b-4b73-be0b-4e9a2f8636e0",
      "DepartmentID": "DEP01",
      "UserID": "USER_ID",
      "MessageTitle": "You have a new Message",
      "MessageBody": "Open Notification Centre to read your notifications",
      "NotificationTitle": "You have a new Notification",
      "NotificationBody": "Here is the Notification body."
    }
 */

const contract = defineContract({
  requestBodySchema: z.array(IMessageSchema.extend(PostMessageBodyItem)),
  requestPathParametersSchema: z.any(),
  requestQueryParametersSchema: z.any(),
  responseBodySchema: z.array(z.object({ NotificationID: z.string() })).or(z.object()),
});

export class PostMessage extends APIHandler<typeof contract> {
  // API Definition
  public operationId: string = 'postMessage';
  public contract = contract;

  // Services & Repositories
  public analyticsService: AnalyticsService;
  public notificationsDynamoRepository: NotificationsDynamoRepository;
  public processingQueue: ProcessingQueueService;

  // Constructor
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    protected contentValidationService: ContentValidationService,
    dependencies?: () => HandlerDependencies<PostMessage>
  ) {
    super(observability);
    this.injectDependencies(dependencies);
  }

  // Handler logic
  public async implementation(
    event: IAPIContractEvent<typeof contract>,
    context: Context
  ): Promise<IAPIContractResponse<typeof contract>> {
    this.observability.logger.info('Received request', { event });

    const messages = event.body;

    // Prevalidate all messages & reject request when one of them contains unsupported url
    for (const mesage of messages) {
      await this.contentValidationService.validate(mesage.MessageBody);
    }

    // Publish analytics & push items to the processing queue
    this.observability.logger.trace('Publishing analytics events for validated messages.');
    await this.analyticsService.publishMultipleEvents(
      messages.map(
        (body): AnalyticsEventFromIMessage => ({
          ...body,
          APIGWExtendedID: event.requestContext.requestId,
        })
      ),
      NotificationStateEnum.VALIDATED_API_CALL
    );

    // Requeue messages which passed validation to next stage
    this.observability.logger.trace('Requeuing validated message to process queue.');
    await this.processingQueue.publishMessageBatch(messages);

    // Create a record of message in Dynamodb
    this.observability.logger.trace('Creating record of validated messages that have been passed to queue.');
    await this.notificationsDynamoRepository.createRecordBatch(
      messages.map(
        (body): IMessageRecord => ({
          ...body,
          APIGWExtendedID: event.requestContext.requestId,
          ReceivedDateTime: new Date(event.requestContext.requestTimeEpoch).toISOString(),
          ValidatedDateTime: new Date().toISOString(),
          Events: [],
        })
      )
    );

    // Return placeholder status
    return {
      body: event.body.map((x) => {
        return {
          NotificationID: x.NotificationID,
        };
      }),
      statusCode: 202,
    };
  }
}

export const handler = new PostMessage(
  iocGetConfigurationService(),
  iocGetObservabilityService(),
  iocGetContentValidationService(),
  () => ({
    analyticsService: iocGetAnalyticsService(),
    notificationsDynamoRepository: iocGetNotificationDynamoRepository(),
    processingQueue: iocGetProcessingQueueService(),
  })
).handler();
