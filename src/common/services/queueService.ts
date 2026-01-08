import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import {
  SendMessageBatchCommand,
  SendMessageBatchCommandInput,
  SendMessageBatchRequestEntry,
  SendMessageCommand,
  SendMessageCommandInput,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { iocGetLogger, iocGetMetrics, iocGetTracer } from '@common/ioc';

export class QueueService {
  private client;

  public logger: Logger = iocGetLogger();
  public metrics: Metrics = iocGetMetrics();
  public tracer: Tracer = iocGetTracer();

  constructor() {
    this.client = new SQSClient({ region: 'eu-west-2' }); // TODO: Is region init from env variable?
  }

  public async publishMessage(
    sqsQueueUrl: string,
    messageTitle: string,
    messageAuthor: string,
    messageBody: string,
    delaySeconds = 0
  ) {
    const params: SendMessageCommandInput = {
      QueueUrl: sqsQueueUrl,
      DelaySeconds: delaySeconds, // TODO: Does there need to be a delay?
      MessageAttributes: {
        Title: {
          // TODO: Does there need to be a title for every message?
          DataType: 'String',
          StringValue: messageTitle,
        },
        Author: {
          // TODO: Does there need to be an author for every message?
          DataType: 'String',
          StringValue: messageAuthor,
        },
      },
      MessageBody: messageBody,
    };

    try {
      const command = new SendMessageCommand(params);
      const response = await this.client.send(command);

      this.logger.trace(`Successfully published message ID: ${response.MessageId}`); // TODO: What tracing do we want of the response
    } catch (error) {
      this.logger.trace(`SQS Publish Error: ${error}`);
      throw error;
    }
  }

  public async publishMessageBatch(
    sqsQueueUrl: string,
    messageTitle: string,
    messageAuthor: string,
    messageBodies: string[],
    delaySeconds = 0
  ) {
    if (messageBodies.length > 10) {
      const errorMsg = "A single message batch request can include a maximum of 10 messages."
      this.logger.trace(errorMsg)
      throw new Error(errorMsg);
    }
    
    const entries: SendMessageBatchRequestEntry[] = messageBodies.map((body, index) => ({
      Id: `msg_${index}`, 
      DelaySeconds: delaySeconds,
      MessageAttributes: {
        Title: {
          DataType: 'String',
          StringValue: messageTitle, // TODO: Does each message need a different title?
        },
        Author: {
          DataType: 'String',
          StringValue: messageAuthor,
        },
      },
      MessageBody: body,
    }));

    const params: SendMessageBatchCommandInput = {
      QueueUrl: sqsQueueUrl,
      Entries: entries,
    };

    try {
      const command = new SendMessageBatchCommand(params);
      const response = await this.client.send(command);

      if (response.Successful) {
        this.logger.trace(`Successfully published ${response.Successful.length} messages.`); // TODO: What tracing do we want of the response
      }
      if (response.Failed) {
        this.logger.trace(`Failed to publish ${response.Failed.length} messages.`); // TODO: What tracing do we want of the response
      }
    } catch (error) {
      this.logger.trace(`SQS Publish Error: ${error}`);
      throw error;
    }
  }
}
