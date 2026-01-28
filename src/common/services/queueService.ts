import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { SendMessageBatchCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { ConfigurationService } from '@common/services/configurationService';
import { StringParameters } from '@common/utils/parameters';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { IProcessedMessage } from '@project/lambdas/interfaces/IProcessedMessage';

export const serializeRecordBodyToJson = <InputType>(body: InputType, logger: Logger): string => {
  if (typeof body === 'string') {
    return body;
  }
  try {
    return JSON.stringify(body);
  } catch {
    logger.info('Failed parsing record body to JSON', { raw: body });
    throw new Error('Failed parsing record body to JSON');
  }
};

export abstract class QueueService<InputType> {
  protected client: SQSClient;
  protected sqsQueueUrl: string;

  constructor(
    protected logger: Logger,
    protected metrics: Metrics,
    protected tracer: Tracer
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  public async initialize() {
    this.client = new SQSClient({ region: 'eu-west-2' });
    return this;
  }

  public async publishMessage(messageBody: InputType, delaySeconds = 0) {
    this.logger.info(`Publishing message to queue: ${this.sqsQueueUrl}.`);
    try {
      const command = new SendMessageCommand({
        QueueUrl: this.sqsQueueUrl,
        DelaySeconds: delaySeconds,
        MessageBody: serializeRecordBodyToJson<InputType>(messageBody, this.logger),
      });
      const response = await this.client.send(command);

      this.logger.info(`Successfully published message ID: ${response.MessageId}`);
    } catch (error) {
      this.logger.error(`Error publishing to SQS - ${error}`);
    }
  }

  public async publishMessageBatch(message: InputType[], delaySeconds = 0) {
    this.logger.info(`Publishing batch message to queue: ${this.sqsQueueUrl}.`);
    try {
      if (message.length > 10) {
        const errorMsg = 'A single message batch request can include a maximum of 10 messages.';
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // TODO: Add recursive splitting
      const entries = message.map((body, index) => ({
        Id: `msg_${index}`, // TODO: How do ids need to be set
        DelaySeconds: delaySeconds,
        MessageBody: serializeRecordBodyToJson<InputType>(body, this.logger),
      }));

      const command = new SendMessageBatchCommand({
        QueueUrl: this.sqsQueueUrl,
        Entries: entries,
      });
      const response = await this.client.send(command);

      if (response.Successful) {
        this.logger.info(`Successfully published ${response.Successful.length} messages.`);
      }
      if (response.Failed) {
        this.logger.info(`Failed to publish ${response.Failed.length} messages.`);
      }
    } catch (error) {
      this.logger.error(`Error publishing to SQS - ${error}`);
    }
  }
}
