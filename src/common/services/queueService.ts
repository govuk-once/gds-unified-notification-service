import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { MessageAttributeValue, SendMessageBatchCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

export const serializeJsonToRecordBody = <InputType>(body: InputType): string => {
  if (typeof body === 'string') {
    return body;
  }
  try {
    return JSON.stringify(body);
  } catch (error) {
    throw new Error(`Serialization failed: ${error}`);
  }
};

export class QueueService {
  private client;
  private sqsQueueUrl: string;

  constructor(
    sqsQueueUrl: string,
    protected logger: Logger,
    protected metrics: Metrics,
    protected tracer: Tracer
  ) {
    this.client = new SQSClient({ region: 'eu-west-2' });
    this.sqsQueueUrl = sqsQueueUrl;
    this.logger.trace('Queue Service Initialised.');
  }

  public async publishMessage<InputType>(
    messageAttributes: Record<string, MessageAttributeValue>,
    messageBody: InputType,
    delaySeconds = 0
  ) {
    this.logger.trace(`Publishing message to queue: ${this.sqsQueueUrl}.`);

    try {
      const command = new SendMessageCommand({
        QueueUrl: this.sqsQueueUrl,
        DelaySeconds: delaySeconds,
        MessageAttributes: messageAttributes,
        MessageBody: serializeJsonToRecordBody<InputType>(messageBody),
      });
      const response = await this.client.send(command);

      this.logger.trace(`Successfully published message ID: ${response.MessageId}`);
    } catch (error) {
      this.logger.error(`Error publishing to SQS - ${error}`);
      throw error;
    }
  }

  public async publishMessageBatch<InputType>(
    message: [Record<string, MessageAttributeValue>, InputType][],
    delaySeconds = 0
  ) {
    this.logger.trace(`Publishing batch message to queue: ${this.sqsQueueUrl}.`);

    if (message.length > 10) {
      const errorMsg = 'A single message batch request can include a maximum of 10 messages.';
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    const entries = message.map(([attributes, body], index) => ({
      Id: `msg_${index}`, // TODO: How do ids need to be set
      DelaySeconds: delaySeconds,
      MessageAttributes: attributes,
      MessageBody: serializeJsonToRecordBody<InputType>(body),
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
      this.logger.error(`Error publishing to SQS - ${error}`);
      throw error;
    }
  }
}
