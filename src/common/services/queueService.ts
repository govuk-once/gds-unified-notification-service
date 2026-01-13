import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { MessageAttributeValue, SendMessageBatchCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { iocGetLogger, iocGetMetrics, iocGetTracer } from '@common/ioc';

export class QueueService {
  private client: SQSClient;
  private sqsQueueUrl: string;

  public logger: Logger = iocGetLogger();
  public metrics: Metrics = iocGetMetrics();
  public tracer: Tracer = iocGetTracer();

  constructor(sqsQueueUrl: string) {
    this.client = new SQSClient({ region: 'eu-west-2' });
    this.sqsQueueUrl = sqsQueueUrl;
    this.logger.trace('Queue Service Initialised.');
  }

  public async publishMessage(
    messageAttributes: Record<string, MessageAttributeValue>,
    messageBody: string,
    delaySeconds = 0
  ) {
    try {
      const command = new SendMessageCommand({
        QueueUrl: this.sqsQueueUrl,
        DelaySeconds: delaySeconds,
        MessageAttributes: messageAttributes,
        MessageBody: messageBody,
      });
      const response = await this.client.send(command);

      this.logger.trace(`Successfully published message ID: ${response.MessageId}`);
    } catch (error) {
      this.logger.trace(`SQS Publish Error: ${error}`);
      throw error;
    }
  }

  public async publishMessageBatch(message: [Record<string, MessageAttributeValue>, string][], delaySeconds = 0) {
    if (message.length > 10) {
      const errorMsg = 'A single message batch request can include a maximum of 10 messages.';
      this.logger.trace(errorMsg);
      throw new Error(errorMsg);
    }

    const entries = message.map(([attributes, body], index) => ({
      Id: `msg_${index}`, // TODO: How do ids need to be set
      DelaySeconds: delaySeconds,
      MessageAttributes: attributes,
      MessageBody: body,
    }));

    try {
      const command = new SendMessageBatchCommand({
        QueueUrl: this.sqsQueueUrl,
        Entries: entries,
      });
      const response = await this.client.send(command);

      if (response.Successful) {
        this.logger.trace(`Successfully published ${response.Successful.length} messages.`);
      }
      if (response.Failed) {
        this.logger.trace(`Failed to publish ${response.Failed.length} messages.`);
      }
    } catch (error) {
      this.logger.trace(`SQS Publish Error: ${error}`);
      throw error;
    }
  }
}
