import {
  SendMessageBatchCommand,
  SendMessageBatchCommandOutput,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { SerializationError } from '@common/models/Errors/BadRequestError';
import { InternalServerError } from '@common/models/Errors/InternalServerError';
import { ObservabilityService } from '@common/services/observabilityService';
import { mapWithConcurrency } from '@common/utils/mapWithConcurrency';

const MAX_MESSAGES_PER_SEND_CALL = 10;
// SQS caps a SendMessageBatch request at 262,144 bytes in total; leave headroom for entry metadata
const MAX_BYTES_PER_SEND_CALL = 250 * 1024;
// Entries SQS reports as failed (with SenderFault false) are resent with exponential backoff before giving up
const MAX_SEND_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 100;
// Send calls are independent, so several are kept in flight at once to shorten large publishes
const MAX_CONCURRENT_SEND_CALLS = 5;

export const serializeRecordBodyToJson = <InputType>(body: InputType, observability: ObservabilityService): string => {
  if (typeof body === 'string') {
    return body;
  }
  try {
    return JSON.stringify(body);
  } catch {
    const errorMsg = 'Failed parsing record body to JSON';
    observability.logger.error(errorMsg, { raw: body });
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
    this.observability.logger.info('Publishing message to queue', {
      queueName: this.getQueueName(),
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

  /**
   * Serialises messages and packs them into groups, one group per SendMessageBatch API call. Each group is bounded by
   * both the maximum number of messages (10) and the maximum total payload (256 KiB, with headroom) SQS allows per call.
   * Messages are never split: a message is always sent whole, so this only decides which messages share an API call.
   */
  private groupMessagesIntoSendCalls(messages: InputType[]): string[][] {
    const sendCalls: string[][] = [];
    let currentCall: string[] = [];
    let currentCallBytes = 0;

    for (const message of messages) {
      const body = serializeRecordBodyToJson<InputType>(message, this.observability);
      const bodyBytes = Buffer.byteLength(body, 'utf8');

      const callIsFull =
        currentCall.length >= MAX_MESSAGES_PER_SEND_CALL || currentCallBytes + bodyBytes > MAX_BYTES_PER_SEND_CALL;
      if (currentCall.length > 0 && callIsFull) {
        sendCalls.push(currentCall);
        currentCall = [];
        currentCallBytes = 0;
      }
      currentCall.push(body);
      currentCallBytes += bodyBytes;
    }
    if (currentCall.length > 0) {
      sendCalls.push(currentCall);
    }
    return sendCalls;
  }

  public async publishMessageBatch(messages: InputType[], delaySeconds = 0) {
    if (messages.length === 0) {
      this.observability.logger.info('No messages to publish to queue', { queueName: this.getQueueName() });
      return;
    }

    // Callers retry the whole publish when this throws, so no new send call is started once one has failed (calls
    // already in flight finish first) to avoid publishing messages that the retry would only send again.
    await mapWithConcurrency(
      this.groupMessagesIntoSendCalls(messages),
      MAX_CONCURRENT_SEND_CALLS,
      (messageBodiesInCall) => this.sendCallWithRetry(messageBodiesInCall, delaySeconds)
    );
  }

  /** Sends one SendMessageBatch call, resending the entries SQS rejects until they succeed or attempts run out. */
  private async sendCallWithRetry(messageBodiesInCall: string[], delaySeconds: number) {
    // Entry Ids only need to be unique within a single SendMessageBatch call
    let pendingEntries = messageBodiesInCall.map((body, index) => ({
      Id: index.toString(),
      DelaySeconds: delaySeconds,
      MessageBody: body,
    }));

    for (let attempt = 1; ; attempt++) {
      let response: SendMessageBatchCommandOutput;
      try {
        response = await this.client.send(
          new SendMessageBatchCommand({ QueueUrl: this.sqsQueueUrl, Entries: pendingEntries })
        );
      } catch (error) {
        this.observability.logger.error('Error publishing to SQS', {
          error: this.observability.formatError(error),
        });
        throw error;
      }

      if (response.Successful?.length) {
        this.observability.logger.info('Successfully published messages', {
          successfulMessageCount: response.Successful.length,
        });
        this.addPublishingSuccessMetric(response.Successful.length);
      }

      const failures = response.Failed ?? [];
      if (failures.length === 0) {
        return;
      }

      // SQS accepted the call but rejected some entries. Only entries not at fault of the sender are worth resending
      const canRetry = attempt < MAX_SEND_ATTEMPTS && failures.every((failure) => failure.SenderFault !== true);
      if (!canRetry) {
        this.observability.logger.error('Failed to publish messages in batch', {
          failedMessageCount: failures.length,
          failures,
          attempts: attempt,
        });
        this.addPublishingFailedMetric(failures.length);
        throw new InternalServerError([
          `Failed to publish ${failures.length} message(s) to queue ${this.getQueueName()} after ${attempt} attempt(s)`,
          ...failures.map((failure) => `${failure.Id}: ${failure.Code}`),
        ]);
      }

      this.observability.logger.warn('Retrying messages that failed to publish in batch', {
        failedMessageCount: failures.length,
        failures,
        attempt,
      });
      const failedIds = new Set(failures.map((failure) => failure.Id));
      pendingEntries = pendingEntries.filter((entry) => failedIds.has(entry.Id));
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)));
    }
  }
}
