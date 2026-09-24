import { Alarm, ComparisonOperator, Metric, Stats } from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { MetricsLabels } from '../../../../src/common/services/observabilityService';
import {
  AlarmPeriod,
  alarmPriority,
  numericThreshold,
  P95_STATISTIC,
  UNSAlarmsConstruct,
  UNSAlarmsProps,
} from './UNSAlarmConstructs';

export const OperationalAlarmThreshold = {
  QUEUE_DEPTH: 1000,
  DLQ_DEPTH_MEDIUM: 10,
  DLQ_DEPTH_HIGH: 1000,
  DLQ_OLDEST_MESSAGE: 3 * 3600 * 24, // 3 Days in seconds
  FAILURE_RATE_PERCENTAGE: 5,
  PROCESSING_DURATION_P95_MS: 3000,
  DISPATCH_DURATION_P95_MS: 5000,
  VALIDATION_DURATION_P95_MS: 2000,
} as const;

interface QueueTarget {
  name: string;
  queueName: string;
}

interface UNSOperationalAlarmsProps extends UNSAlarmsProps {
  queues: QueueTarget[];
  dlqs: QueueTarget[];
}

export class UNSOperationalAlarmsConstruct extends UNSAlarmsConstruct {
  public readonly alarms: Alarm[] = [];

  constructor(scope: Construct, config: EnvVars, props: UNSOperationalAlarmsProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    props.names = [...(props.names ?? []), 'operational'];
    super(scope, config, props);

    const { group, queues, dlqs } = props;

    // SQS Depth Alarm
    for (const { name, queueName } of queues) {
      this.addAlarm({
        id: constructNamingHelper('sqsDepthAlarm', group, name),
        name: namingHelper(alarmPriority.HIGH, group, 'SqsQueueDepthHigh', name),
        description: `SQS queue '${name}' exceeded ${OperationalAlarmThreshold.QUEUE_DEPTH} visible messages for 5 consecutive minutes.`,
        metric: new Metric({
          namespace: 'AWS/SQS',
          metricName: 'ApproximateNumberOfMessagesVisible',
          dimensionsMap: { QueueName: queueName },
          statistic: Stats.MAXIMUM,
          period: AlarmPeriod.ONE_MINUTE,
        }),
        threshold: OperationalAlarmThreshold.QUEUE_DEPTH,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 5,
        datapointsToAlarm: 5,
      });
    }

    // Rate limiting enforced alarm
    this.addAlarm({
      id: constructNamingHelper('rateLimitEnforcedAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'DispatchRateLimitingEnforced'),
      description: `Dispatch circuit breaker enforced rate limiting for 2 consecutive minutes.`,
      metric: this.customMetric(
        MetricsLabels.CIRCUIT_BREAKER_RATE_LIMITING_ENFORCED,
        Stats.MAXIMUM,
        AlarmPeriod.ONE_MINUTE
      ),
      threshold: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
    });

    // Validation failure rate alarm
    this.addRateAlarm({
      id: constructNamingHelper('validationFailureRateAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'ValidationFailureRateHigh'),
      description: `Validation failure rate exceeded ${OperationalAlarmThreshold.FAILURE_RATE_PERCENTAGE}% over a 5-minute window.`,
      failed: this.customMetric(MetricsLabels.ANALYTICS_EVENT_VALIDATION_FAILED, Stats.SUM),
      total: this.customMetric(MetricsLabels.ANALYTICS_EVENT_VALIDATING, Stats.SUM),
      threshold: OperationalAlarmThreshold.FAILURE_RATE_PERCENTAGE,
      label: 'validation failure rate (%)',
    });

    // Processing failure rate alarm
    this.addRateAlarm({
      id: constructNamingHelper('processingFailureRateAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'ProcessingFailureRateHigh'),
      description: `Processing failure rate exceeded ${OperationalAlarmThreshold.FAILURE_RATE_PERCENTAGE}% over a 5-minute window.`,
      failed: this.customMetric(MetricsLabels.ANALYTICS_EVENT_PROCESSING_FAILED, Stats.SUM),
      total: this.customMetric(MetricsLabels.ANALYTICS_EVENT_PROCESSING, Stats.SUM),
      threshold: OperationalAlarmThreshold.FAILURE_RATE_PERCENTAGE,
      label: 'processing failure rate (%)',
    });

    // Dispatching failure rate alarm
    this.addRateAlarm({
      id: constructNamingHelper('dispatchFailureRateAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'DispatchFailureRateHigh'),
      description: `Dispatch failure rate exceeded ${OperationalAlarmThreshold.PROCESSING_DURATION_P95_MS}% over a 5-minute window.`,
      failed: this.customMetric(MetricsLabels.ANALYTICS_EVENT_DISPATCHING_FAILED, Stats.SUM),
      total: this.customMetric(MetricsLabels.ANALYTICS_EVENT_DISPATCHING, Stats.SUM),
      threshold: OperationalAlarmThreshold.FAILURE_RATE_PERCENTAGE,
      label: 'dispatch failure rate (%)',
    });

    // Validation duration alarm
    this.addAlarm({
      id: constructNamingHelper('validationDurationAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'ValidationDurationP95High'),
      description: `Validation p95 duration exceeded ${OperationalAlarmThreshold.VALIDATION_DURATION_P95_MS} ms over a 5-minute window.`,
      metric: this.customMetric(MetricsLabels.VALIDATION_DURATION, P95_STATISTIC, AlarmPeriod.FIVE_MINUTES),
      threshold: OperationalAlarmThreshold.VALIDATION_DURATION_P95_MS,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
    });

    // Processing duration alarm
    this.addAlarm({
      id: constructNamingHelper('processingDurationAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'ProcessingDurationP95High'),
      description: `Processing p95 duration exceeded ${OperationalAlarmThreshold.PROCESSING_DURATION_P95_MS} ms over a 5-minute window.`,
      metric: this.customMetric(MetricsLabels.PROCESSING_DURATION, P95_STATISTIC, AlarmPeriod.FIVE_MINUTES),
      threshold: OperationalAlarmThreshold.PROCESSING_DURATION_P95_MS,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
    });

    // Group Processing duration alarm
    this.addAlarm({
      id: constructNamingHelper('groupProcessingDurationAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'GroupProcessingDurationP95PerMessageHigh'),
      description: `Group Processing p95 duration exceeded ${OperationalAlarmThreshold.PROCESSING_DURATION_P95_MS} ms per message over a 5-minute window.`,
      metric: this.customMetric(
        MetricsLabels.GROUP_PROCESSING_DURATION_PER_MESSAGE,
        P95_STATISTIC,
        AlarmPeriod.FIVE_MINUTES
      ),
      threshold: OperationalAlarmThreshold.PROCESSING_DURATION_P95_MS,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
    });

    // Dispatching duration alarm
    this.addAlarm({
      id: constructNamingHelper('dispatchDurationAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'DispatchDurationP95High'),
      description: `Dispatch p95 duration exceeded ${OperationalAlarmThreshold.PROCESSING_DURATION_P95_MS} ms over a 5-minute window.`,
      metric: this.customMetric(MetricsLabels.DISPATCH_DURATION, P95_STATISTIC, AlarmPeriod.FIVE_MINUTES),
      threshold: OperationalAlarmThreshold.DISPATCH_DURATION_P95_MS,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
    });

    const batchFailureTargets = [
      {
        id: 'validationBatchFailuresAlarm',
        metric: MetricsLabels.BATCH_ITEM_FAILURES_VALIDATION,
        title: 'ValidationBatchItemFailures',
        label: 'Validation',
      },
      {
        id: 'processingBatchFailuresAlarm',
        metric: MetricsLabels.BATCH_ITEM_FAILURES_PROCESSING,
        title: 'ProcessingBatchItemFailures',
        label: 'Processing',
      },
      {
        id: 'dispatchBatchFailuresAlarm',
        metric: MetricsLabels.BATCH_ITEM_FAILURES_DISPATCH,
        title: 'DispatchBatchItemFailures',
        label: 'Dispatch',
      },
      {
        id: 'groupProcessingBatchFailuresAlarm',
        metric: MetricsLabels.BATCH_ITEM_FAILURES_GROUP_PROCESSING,
        title: 'GroupProcessingBatchItemFailures',
        label: 'GroupProcessing',
      },
    ];

    // Batch item failure alarm
    for (const target of batchFailureTargets) {
      this.addAlarm({
        id: constructNamingHelper(target.id, group),
        name: namingHelper(alarmPriority.MEDIUM, group, target.title),
        description: `${target.label} batch item failures detected for 2 consecutive minutes.`,
        metric: this.customMetric(target.metric, Stats.SUM, AlarmPeriod.ONE_MINUTE),
        threshold: numericThreshold.ZERO_THRESHOLD,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 2,
        datapointsToAlarm: 2,
      });
    }

    const publishFailureTargets = [
      {
        id: 'processingPublishFailuresAlarm',
        metric: MetricsLabels.QUEUE_PROCESSING_PUBLISHED_FAILED,
        title: 'ProcessingQueuePublishFailed',
        label: 'processing',
      },
      {
        id: 'groupProcessingPublishFailuresAlarm',
        metric: MetricsLabels.QUEUE_GROUP_PROCESSING_PUBLISHED_FAILED,
        title: 'GroupProcessingQueuePublishFailed',
        label: 'groupprocessing',
      },
      {
        id: 'dispatchPublishFailuresAlarm',
        metric: MetricsLabels.QUEUE_DISPATCH_PUBLISHED_FAILED,
        title: 'DispatchQueuePublishFailed',
        label: 'dispatch',
      },
      {
        id: 'analyticsPublishFailuresAlarm',
        metric: MetricsLabels.QUEUE_ANALYTICS_PUBLISHED_FAILED,
        title: 'AnalyticsQueuePublishFailed',
        label: 'analytics',
      },
    ];

    // Publishing failed alarm
    for (const target of publishFailureTargets) {
      this.addAlarm({
        id: constructNamingHelper(target.id, group),
        name: namingHelper(alarmPriority.MEDIUM, group, target.title),
        description: `Failed to publish to the ${target.label} queue within a 1-minute period.`,
        metric: this.customMetric(target.metric, Stats.SUM, AlarmPeriod.ONE_MINUTE),
        threshold: numericThreshold.ZERO_THRESHOLD,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
      });
    }

    for (const { name, queueName } of dlqs) {
      // DLQ Number of Messages Alarm
      this.addAlarm({
        id: constructNamingHelper('dlqMessageCountAlarmMedium', group, name),
        name: namingHelper(alarmPriority.MEDIUM, group, 'dlqMessageCountMedium', name),
        description: `DLQ queue '${name}' exceeded ${OperationalAlarmThreshold.DLQ_DEPTH_MEDIUM} visible messages for 15 consecutive minutes.`,
        metric: new Metric({
          namespace: 'AWS/SQS',
          metricName: 'ApproximateNumberOfMessagesVisible',
          dimensionsMap: { QueueName: queueName },
          statistic: Stats.MAXIMUM,
          period: AlarmPeriod.ONE_MINUTE,
        }),
        threshold: OperationalAlarmThreshold.DLQ_DEPTH_MEDIUM,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 15,
        datapointsToAlarm: 1,
      });

      this.addAlarm({
        id: constructNamingHelper('MessageCountAlarmHigh', group, name),
        name: namingHelper(alarmPriority.HIGH, group, 'MessageCountHigh', name),
        description: `DLQ queue '${name}' exceeded ${OperationalAlarmThreshold.DLQ_DEPTH_HIGH} visible messages for 15 consecutive minutes.`,
        metric: new Metric({
          namespace: 'AWS/SQS',
          metricName: 'ApproximateNumberOfMessagesVisible',
          dimensionsMap: { QueueName: queueName },
          statistic: Stats.MAXIMUM,
          period: AlarmPeriod.ONE_MINUTE,
        }),
        threshold: OperationalAlarmThreshold.DLQ_DEPTH_HIGH,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 15,
        datapointsToAlarm: 1,
      });

      // DLQ Oldest Message in Queue Alarm
      this.addAlarm({
        id: constructNamingHelper('OldestMessageAlarmHigh', group, name),
        name: namingHelper(alarmPriority.HIGH, group, 'OldestMessageHigh', name),
        description: `Oldest message in DLQ queue '${name}' exceeded an age of ${OperationalAlarmThreshold.DLQ_OLDEST_MESSAGE}.`,
        metric: new Metric({
          namespace: 'AWS/SQS',
          metricName: 'ApproximateAgeOfOldestMessage',
          dimensionsMap: { QueueName: queueName },
          statistic: Stats.MAXIMUM,
          period: AlarmPeriod.ONE_MINUTE,
        }),
        threshold: OperationalAlarmThreshold.DLQ_OLDEST_MESSAGE,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 15,
        datapointsToAlarm: 1,
      });
    }
  }
}
