import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import {
  APIHandler,
  HandlerDependencies,
  initializeDependencies,
  iocGetAnalyticsService,
  iocGetConfigurationService,
  iocGetInboundDynamoRepository,
  iocGetLogger,
  iocGetMetrics,
  iocGetProcessingQueueService,
  iocGetTracer,
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
 * Sample event:
{
  "Records": {
    "body": [
      {
        "NotificationID": "1234",
        "DepartmentID": "DEP01",
        "UserID": "UserID",
        "MessageTitle": "You have a new Message",
        "MessageBody": "Open Notification Centre to read your notifications",
        "NotificationTitle": "You have a new Notification",
        "NotificationBody": "Here is the Notification body."
      }
    ],
    "headers": {
      "x-api-key": "mockApiKey",
      "Content-Type": "application/json"
    },
    "requestContext": {
      "requestId": "c6af9ac6-7b61-11e6-9a41-93e8deadbeef",
      "requestTimeEpoch": 1428582896000
    }
  }
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
    logger: Logger,
    metrics: Metrics,
    tracer: Tracer,
    public asyncDependencies?: () => HandlerDependencies<PostMessage>
  ) {
    super(logger, metrics, tracer);
  }

  public async initialize() {
    await initializeDependencies(this, this.asyncDependencies);
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    this.logger.info('Received request');

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
    this.logger.trace('Publishing analytics events for validated messages.');
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
    this.logger.trace('Requeuing validated message to process queue.');
    await this.processingQueue.publishMessageBatch(messages);

    // Create a record of message in Dynamodb
    this.logger.trace('Creating record of validated messages that have been passed to queue.');
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
      statusCode: 200,
    };
  }
}

export const handler = new PostMessage(
  iocGetConfigurationService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer(),
  () => ({
    analyticsService: iocGetAnalyticsService(),
    inboundTable: iocGetInboundDynamoRepository(),
    processingQueue: iocGetProcessingQueueService(),
  })
).handler();
