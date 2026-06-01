import { Duration } from 'aws-cdk-lib';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';

export interface UNSQueueConstructProps {
  readonly name: string[];
  readonly delaySeconds?: number;
  readonly tags?: Record<string, string>;
  readonly maxMessageSizeBytes?: number;
  readonly messageRetentionSeconds?: number;
  readonly receiveTimeWaitSeconds?: number;
  readonly visibilityTimeoutSeconds?: number;
  readonly resources: {
    readonly kmsKey: IKey;
    readonly kmsKeyReuse?: number;
  };
  readonly deadLetterQueue?: {
    readonly name?: string[];
    readonly delaySeconds?: number;
    readonly tags?: Record<string, string>;
    readonly maxMessageSizeBytes?: number;
    readonly messageRetentionSeconds?: number;
    readonly receiveTimeWaitSeconds?: number;
    readonly visibilityTimeoutSeconds?: number;
    readonly maxRetries?: number;
    readonly resources?: {
      readonly kmsKey: IKey;
      readonly kmsKeyReuse?: number;
    };
  };
}

export class UNSQueueConstruct extends Construct {
  public readonly queue: Queue;
  public readonly dlq?: Queue;

  constructor(scope: Construct, config: EnvVars, props: UNSQueueConstructProps) {
    const { constructNamingHelper, namingHelper } = config.utils;
    super(scope, constructNamingHelper(`sqs`, ...props.name));

    // Conditionally instantiate the Dead Letter Queue (DLQ) first
    if (props.deadLetterQueue !== undefined) {
      // Merge parent props with DLQ specific overrides
      const dlqCombinedProps = {
        ...props,
        ...props.deadLetterQueue,
        name: [...props.name, 'dlq'],
      };

      this.dlq = new Queue(this, `dlq`, {
        queueName: namingHelper(...dlqCombinedProps.name),
        deliveryDelay: Duration.seconds(dlqCombinedProps.delaySeconds ?? 10),
        maxMessageSizeBytes: dlqCombinedProps.maxMessageSizeBytes ?? 2048,
        retentionPeriod: Duration.seconds(dlqCombinedProps.messageRetentionSeconds ?? 86400),
        receiveMessageWaitTime: Duration.seconds(dlqCombinedProps.receiveTimeWaitSeconds ?? 10),
        visibilityTimeout: Duration.seconds(dlqCombinedProps.visibilityTimeoutSeconds ?? 30),
        encryptionMasterKey: dlqCombinedProps.resources?.kmsKey ?? props.resources.kmsKey,
        encryption: QueueEncryption.KMS,
        dataKeyReuse: Duration.seconds(dlqCombinedProps.resources?.kmsKeyReuse ?? props.resources.kmsKeyReuse ?? 3600),
      });
    }

    // Instantiate the Main SQS Queue
    this.queue = new Queue(this, `queue`, {
      queueName: namingHelper(...props.name),
      deliveryDelay: Duration.seconds(props.delaySeconds ?? 10),
      maxMessageSizeBytes: props.maxMessageSizeBytes ?? 2048,
      retentionPeriod: Duration.seconds(props.messageRetentionSeconds ?? 86400),
      receiveMessageWaitTime: Duration.seconds(props.receiveTimeWaitSeconds ?? 10),
      visibilityTimeout: Duration.seconds(props.visibilityTimeoutSeconds ?? 30),
      encryptionMasterKey: props.resources.kmsKey,
      encryption: QueueEncryption.KMS,
      dataKeyReuse: Duration.seconds(props.resources.kmsKeyReuse ?? 3600),
      // Attach DLQ targeting definition if configured
      ...(props.deadLetterQueue && this.dlq
        ? {
            deadLetterQueue: {
              maxReceiveCount: props.deadLetterQueue.maxRetries ?? 10,
              queue: this.dlq,
            },
          }
        : {}),
    });
  }
}
