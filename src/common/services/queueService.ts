import { SendMessageBatchCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { SerializationError } from '@common/models/Errors/BadRequestError';
import { ObservabilityService } from '@common/services/observabilityService';

export const serializeRecordBodyToJson = <InputType>(body: InputType, observability: ObservabilityService): string => {
  if (typeof body === 'string') {
    return body;
  }
  try {
    return JSON.stringify(body);
  } catch {
    const errorMsg = 'Failed parsing record body to JSON';
    observability.logger.info(errorMsg, { raw: body });
    throw new SerializationError([errorMsg]);
  }
};

export abstract class QueueService<InputType> {
  protected abstract queueName: string;

  constructor(
    protected readonly observability: ObservabilityService,
    protected readonly client: SQSClient,
    protected readonly sqsQueueUrl: string
  ) {
    this.observability.tracer.captureAWSv3Client(this.client);
  }

  public getQueueName() {
    return this.queueName;
  }

  public abstract addPublishingSuccessMetric(count: number): void;

  public abstract addPublishingFailedMetric(count: number): void;

  public async publishMessage(messageBody: InputType, delaySeconds = 0) {
    this.observability.logger.info(`Publishing message to queue'`, {
      queueName: this.getQueueName(),
      sqsMessageBody: messageBody,
    });

    try {
      const command = new SendMessageCommand({
        QueueUrl: this.sqsQueueUrl,
        DelaySeconds: delaySeconds,
        MessageBody: serializeRecordBodyToJson<InputType>(messageBody, this.observability),
      });
      const response = await this.client.send(command);

      this.observability.logger.info('Successfully published message ID', { messageId: response.MessageId });
      this.addPublishingSuccessMetric(1);
    } catch (error) {
      this.observability.logger.error('Error publishing to SQS', {
        error: this.observability.formatError(error),
      });
      this.addPublishingFailedMetric(1);
      throw error;
    }
  }

  public async publishMessageBatch(messages: InputType[], delaySeconds = 0) {
    if (messages.length === 0) {
      this.observability.logger.info('No messages to publish to queue', { queueName: this.getQueueName() });
      return;
    }

    const batchSize = 10;
    for (let i = 0; i < messages.length; i += batchSize) {
      const chunk = messages.slice(i, i + batchSize);

      // Adds an index to show which chunk of the batch is being processed
      const entries = chunk.map((body, index) => ({
        Id: index.toString(),
        DelaySeconds: delaySeconds,
        MessageBody: serializeRecordBodyToJson<InputType>(body, this.observability),
      }));

      try {
        const command = new SendMessageBatchCommand({
          QueueUrl: this.sqsQueueUrl,
          Entries: entries,
        });
        const response = await this.client.send(command);

        if (response.Successful?.length) {
          this.observability.logger.info('Successfully published messages', {
            successfulMessageCount: response.Successful.length,
          });
          this.addPublishingSuccessMetric(response.Successful.length);
        }
        if (response.Failed?.length) {
          this.observability.logger.error('Failed to publish messages in batch', {
            failedMessageCount: response.Failed.length,
            failures: response.Failed,
          });
          this.addPublishingFailedMetric(response.Failed.length);
        }
      } catch (error) {
        this.observability.logger.error('Error publishing to SQS', {
          error: this.observability.formatError(error),
        });
        throw error;
      }
    }
  }
}
