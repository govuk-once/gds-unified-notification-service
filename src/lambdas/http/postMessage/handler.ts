import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import {
  APIHandler,
  HandlerDependencies,
  initializeDependencies,
  iocGetAnalyticsQueueService,
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
import { toIMessageRecord } from '@common/builders/toIMessageRecord';
import { InboundDynamoRepository } from '@common/repositories';
import { AnalyticsQueueService, ConfigurationService, ProcessingQueueService } from '@common/services';
import { groupValidation } from '@common/utils/zod';
import { IMessageSchema } from '@project/lambdas/interfaces/IMessage';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.array(IMessageSchema);
const responseBodySchema = z.array(z.object({ NotificationID: z.string() }));

export class PostMessage extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'postMessage';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public analyticsQueue: AnalyticsQueueService;
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
    if (event.requestContext.identity.apiKey !== apiKey) {
      throw new Error('Unauthorized');
    }

    // Initialize services
    await this.initialize();

    const [, validRecords, invalidRecords] = groupValidation(event.body, IMessageSchema);

    // Store success entries
    const messageRecords: IMessageRecord[] = [];
    for (const data of validRecords) {
      const inboundRecord = toIMessageRecord(
        {
          recordFields: data.valid,
          receivedDateTime: new Date(event.requestContext.requestTimeEpoch),
          validatedDateTime: new Date(),
        },
        this.logger
      );

      if (inboundRecord) {
        messageRecords.push(inboundRecord);
      }
    }

    // Store failed entries
    const partialMessageRecords: IMessageRecord[] = [];
    for (const data of invalidRecords) {
      if (data == undefined) {
        continue;
      }

      const inboundRecord = toIMessageRecord(
        {
          recordFields: data.raw,
          receivedDateTime: new Date(event.requestContext.requestTimeEpoch),
        },
        this.logger
      );

      if (inboundRecord) {
        partialMessageRecords.push(inboundRecord);
      }
    }

    // Requeue messages which passed validation to next stage
    const messagesToPass = validRecords.map((data) => data.valid);
    if (messagesToPass.length > 0) {
      this.logger.trace('Requeuing validated message to process queue');
      await this.processingQueue.publishMessageBatch(messagesToPass);
    }

    // Create a record of message in Dynamodb
    if (messageRecords.length > 0) {
      this.logger.trace('Creating record of validated messages that have been passed to queue.');
      await this.inboundTable.createRecordBatch(messageRecords);
    }

    if (partialMessageRecords.length > 0) {
      this.logger.trace('Creating record of messages that failed validation.');
      await this.inboundTable.createRecordBatch(partialMessageRecords);
    }

    this.logger.trace('Completed request');

    // Return placeholder status
    return {
      body: messagesToPass.map((x) => {
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
    analyticsService: iocGetAnalyticsQueueService(),
    inboundTable: iocGetInboundDynamoRepository(),
    processingQueue: iocGetProcessingQueueService(),
  })
).handler();
