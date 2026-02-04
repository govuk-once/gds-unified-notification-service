import {
  APIHandler,
  HandlerDependencies,
  initializeDependencies,
  iocGetAnalyticsService,
  iocGetConfigurationService,
  iocGetInboundDynamoRepository,
  iocGetObservabilityService,
  iocGetProcessingQueueService,
  StringParameters,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { InboundDynamoRepository } from '@common/repositories';
import {
  AnalyticsEventFromIMessage,
  AnalyticsService,
  ConfigurationService,
  ObservabilityService,
  ProcessingQueueService,
} from '@common/services';
import { IMessageSchema } from '@project/lambdas/interfaces/IMessage';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.array(IMessageSchema).min(1);
const responseBodySchema = z.array(z.object({ NotificationID: z.string() })).or(z.object());

/**
 * Lambda handling incoming messages from a api request
 * - Validates input against zod schema
 *   - Stores messages into inbound dynamodb
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

export class PostMessage extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'postMessage';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public analyticsService: AnalyticsService;
  public inboundTable: InboundDynamoRepository;
  public processingQueue: ProcessingQueueService;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    public asyncDependencies?: () => HandlerDependencies<PostMessage>
  ) {
    super(observability);
  }

  public async initialize() {
    await initializeDependencies(this, this.asyncDependencies);
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    this.observability.logger.info('Received request');

    // MOCK authorizing request
    const apiKey = await this.config.getParameter(StringParameters.Api.PostMessage.ApiKey);
    if (event.headers['x-api-key'] !== apiKey) {
      return {
        body: {},
        statusCode: 401,
      };
    }

    // Initialize services
    await this.initialize();

    const messages = event.body;

    // Publish analytics & push items to the processing queue
    this.observability.logger.trace('Publishing analytics events for validated messages.');
    await this.analyticsService.publishMultipleEvents(
      messages.map(
        (body): AnalyticsEventFromIMessage => ({
          ...body,
          APIGWExtendedID: event.requestContext.requestId,
        })
      ),
      ValidationEnum.VALIDATED_API_CALL
    );

    // Requeue messages which passed validation to next stage
    this.observability.logger.trace('Requeuing validated message to process queue.');
    await this.processingQueue.publishMessageBatch(messages);

    // Create a record of message in Dynamodb
    this.observability.logger.trace('Creating record of validated messages that have been passed to queue.');
    await this.inboundTable.createRecordBatch(
      messages.map(
        (body): IMessageRecord => ({
          ...body,
          APIGWExtendedID: event.requestContext.requestId,
          ReceivedDateTime: new Date(event.requestContext.requestTimeEpoch).toISOString(),
          ValidatedDateTime: new Date().toISOString(),
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

export const handler = new PostMessage(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  analyticsService: iocGetAnalyticsService(),
  inboundTable: iocGetInboundDynamoRepository(),
  processingQueue: iocGetProcessingQueueService(),
})).handler();
