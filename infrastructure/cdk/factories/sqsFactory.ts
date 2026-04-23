import { IKey } from 'aws-cdk-lib/aws-kms';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Duration, Stack } from 'aws-cdk-lib/core';
import { EnvVars } from 'infrastructure/cdk/config';

type QueueProps = {
  name: string[];
  tags: Record<string, string>;
  delaySeconds?: number;
  maxMessageSizeBytes?: number;
  messageRetentionSeconds?: number;
  receiveTimeWaitSeconds?: number;
  visibilityTimeoutSeconds?: number;
  resources?: { kmsKey: IKey; kmsKeyReuse?: number };
};

type DlqQueueProps = Partial<QueueProps> & {
  maxRetries: 3;
};

export const queueFactory = (
  stack: Stack,
  config: EnvVars,
  props: QueueProps & { deadLetterQueue?: DlqQueueProps }
): { queue: Queue; dlq?: Queue } => {
  // DLQ inherits parent queue properties be defined using the exact same properties as queue
  let dlq: Queue | undefined = undefined;
  if (props.deadLetterQueue !== undefined) {
    const { queue } = queueFactory(stack, config, {
      ...props,
      ...props.deadLetterQueue,
      name: [...props.name, 'dlq'],
      deadLetterQueue: undefined,
    });
    dlq = queue;
    config.utils.tagsHelper(dlq);
  }

  const queue = new Queue(stack, config.utils.namingHelper('sqs', ...props.name), {
    // Metadata
    // Queue props
    deliveryDelay: Duration.seconds(props.delaySeconds ?? 10),
    maxMessageSizeBytes: props.maxMessageSizeBytes ?? 2048,
    retentionPeriod: Duration.seconds(props.messageRetentionSeconds ?? 86400),
    receiveMessageWaitTime: Duration.seconds(props.receiveTimeWaitSeconds ?? 10),
    visibilityTimeout: Duration.seconds(props.visibilityTimeoutSeconds ?? 30),

    // KMS config
    ...(props.resources?.kmsKey
      ? {
          encryptionMasterKey: props.resources.kmsKey,
          dataKeyReuse: Duration.seconds(props.resources.kmsKeyReuse ?? 3600),
        }
      : {}),

    // DLQ setup
    ...(props.deadLetterQueue && dlq
      ? {
          deadLetterQueue: {
            maxReceiveCount: props?.deadLetterQueue?.maxRetries ?? 10,
            queue: dlq,
          },
        }
      : {}),
  });
  config.utils.tagsHelper(queue);

  return { queue, dlq };
};
