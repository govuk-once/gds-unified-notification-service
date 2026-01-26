import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import {
  APIHandler,
  iocGetConfigurationService,
  iocGetDynamoRepository,
  iocGetLogger,
  iocGetMetrics,
  iocGetQueueService,
  iocGetTracer,
  segment,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { toIMessageRecord } from '@common/builders/IMessageRecord';
import { Configuration } from '@common/services';
import { StringParameters } from '@common/utils/parameters';
import { groupValidation } from '@common/utils/zod';
import { IMessage, IMessageSchema } from '@project/lambdas/interfaces/IMessage';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import type { Context } from 'aws-lambda';
import { Axios } from 'axios';
import z from 'zod';

const requestBodySchema = z.array(IMessageSchema);
const responseBodySchema = z.object({ NotificationID: z.string() });

export class PostMessage extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'postMessage';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  constructor(
    protected config: Configuration,
    logger: Logger,
    metrics: Metrics,
    tracer: Tracer
  ) {
    super(logger, metrics, tracer);
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    // Otel examples
    this.logger.info('Received request');
    this.metrics.addMetric('requests-received', MetricUnit.Count, 1);
    this.tracer.putAnnotation('annotation', true);

    // ioc
    const processingQueueUrl = (await this.config.getParameter(StringParameters.Queue.Processing.Url)) ?? '';
    const processingQueue = iocGetQueueService(processingQueueUrl);
    const messageRecordTableName = (await this.config.getParameter(StringParameters.Table.Inbound.Name)) ?? '';
    const messageRecordTable = iocGetDynamoRepository(messageRecordTableName);
    const analyticsQueueUrl = (await this.config.getParameter(StringParameters.Queue.Analytics.Url)) ?? '';
    const analyticsQueue = iocGetQueueService(analyticsQueueUrl);

    // Custom segment example - make an API call, expect failure
    try {
      const status = await segment(this.tracer, '### my handler content', async () => {
        const request = await new Axios().get('http://localhost/404');
        return request.status;
      });
      this.tracer.putMetadata('successful status', {
        status: status,
      });
    } catch (e) {
      this.tracer.putMetadata('failed request', {
        error: e,
      });
    }
    const [records, validRecords, invalidRecords] = groupValidation(event.body, IMessageSchema);

    // Store success entries
    const messageRecords: IMessageRecord[] = [];
    for (const data of validRecords) {
      const record = toIMessageRecord(
        data.valid,
        event.requestContext.requestTimeEpoch.toString(),
        Date.now().toString()
      );
      messageRecords.push(record);
    }

    // Store failed entries
    const partialMessageRecords: IMessageRecord[] = [];
    for (const data of invalidRecords) {
      if (data == undefined) {
        continue;
      }

      try {
        const record = toIMessageRecord(data.raw, event.requestContext.requestTimeEpoch.toString());
        partialMessageRecords.push(record);
      } catch (error: unknown) {
        if (error instanceof Error) {
          this.logger.error(error.message);
        } else {
          throw error;
        }
      }
    }

    // Requeue messages which passed validation to next stage
    const messagesToPass = validRecords.map((data) => data.valid);
    if (messagesToPass.length > 0) {
      this.logger.trace('Requeuing validated message to process queue');
      await processingQueue.publishMessageBatch<IMessage>(messagesToPass);
    }

    // Create a record of message in Dynamodb
    if (validRecords.length > 0) {
      this.logger.trace('Creating record of validated messages that have been passed to queue.');
      await messageRecordTable.createRecordBatch<IMessageRecord>(messageRecords);
    }

    if (invalidRecords.length > 0) {
      this.logger.trace('Creating record of messages that failed validation.');
      await messageRecordTable.createRecordBatch<IMessageRecord>(partialMessageRecords);
    }

    // (MOCK) Send event to events queue
    await analyticsQueue.publishMessage('Test message body.');
    this.logger.trace('Completed request');

    // Return placeholder status
    return {
      body: {
        status: 'ok',
      },
      statusCode: 200,
    };
  }
}

export const handler = new PostMessage(
  iocGetConfigurationService(),
  iocGetLogger(),
  iocGetMetrics(),
  iocGetTracer()
).handler();
