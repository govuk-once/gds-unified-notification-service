import { Duration } from 'aws-cdk-lib';
import {
  Alarm,
  ComparisonOperator,
  IMetric,
  MathExpression,
  Metric,
  Stats,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { ITopic } from 'aws-cdk-lib/aws-sns';
import { IQueue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';

const PRIORITY_HIGH = 'P2';
const PRIORITY_MEDIUM = 'P3';

const QUEUE_DEPTH_THRESHOLD = 1000; 
const FAILURE_RATE_THRESHOLD = 5;
const PROCESSING_DURATION_P95_MS = 3000;
const DISPATCH_DURATION_P95_MS = 5000;
const ZERO = 0;

const P95 = 'p95';
const ONE_MINUTE = Duration.minutes(1);
const FIVE_MINUTES = Duration.minutes(5);

const METRIC = {
  CIRCUIT_BREAKER_RATE_LIMITING_ENFORCED: 'CIRCUIT_BREAKER_RATE_LIMITING_ENFORCED',
  ANALYTICS_EVENT_VALIDATING: 'ANALYTICS_EVENT_VALIDATING',
  ANALYTICS_EVENT_VALIDATION_FAILED: 'ANALYTICS_EVENT_VALIDATION_FAILED',
  ANALYTICS_EVENT_PROCESSING: 'ANALYTICS_EVENT_PROCESSING',
  ANALYTICS_EVENT_PROCESSING_FAILED: 'ANALYTICS_EVENT_PROCESSING_FAILED',
  ANALYTICS_EVENT_DISPATCHING: 'ANALYTICS_EVENT_DISPATCHING',
  ANALYTICS_EVENT_DISPATCHING_FAILED: 'ANALYTICS_EVENT_DISPATCHING_FAILED',
  PROCESSING_DURATION: 'PROCESSING_DURATION',
  DISPATCH_DURATION: 'DISPATCH_DURATION',
  BATCH_ITEM_FAILURES_VALIDATION: 'BATCH_ITEM_FAILURES_VALIDATION',
  BATCH_ITEM_FAILURES_PROCESSING: 'BATCH_ITEM_FAILURES_PROCESSING',
  BATCH_ITEM_FAILURES_DISPATCH: 'BATCH_ITEM_FAILURES_DISPATCH',
  QUEUE_PROCESSING_PUBLISHED_FAILED: 'QUEUE_PROCESSING_PUBLISHED_FAILED',
  QUEUE_DISPATCH_PUBLISHED_FAILED: 'QUEUE_DISPATCH_PUBLISHED_FAILED',
  QUEUE_ANALYTICS_PUBLISHED_FAILED: 'QUEUE_ANALYTICS_PUBLISHED_FAILED',
} as const;
interface QueueTarget {
  name: string;
  queue: IQueue;
}

interface UNSOperationalAlarmsProps {
  alertTopic: ITopic;
  group: string;
  queues: QueueTarget[];
}

export class UNSOperationalAlarmsConstruct extends Construct {
  public readonly alarms: Alarm[] = [];
  constructor(scope: Construct, config: EnvVars, props: UNSOperationalAlarmsProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    super(scope, constructNamingHelper('operational', 'alarms', props.group));
    const { alertTopic, group, queues } = props;
    
    const namespace = `NOTIFICATIONS_${config.project}-${config.env}`.toUpperCase().replace('-', '_');
    const dimensionsMap = {
      service: `NOTIFICATIONS_${group}`.toUpperCase().replace('-', '_'),
      environment: `${config.project}-${config.env}`,
    };
      
    const customMetric = (metricName: string, statistic: string, period: Duration = FIVE_MINUTES): Metric =>
      new Metric({ namespace, metricName, dimensionsMap, statistic, period });
      
    for (const { name, queue } of queues) {
      this.addAlarm({
        id: constructNamingHelper('sqsDepthAlarm', group, name),
        name: namingHelper(PRIORITY_HIGH, group, 'SqsQueueDepthHigh', name),
        description: `SQS queue '${name}' exceeded ${QUEUE_DEPTH_THRESHOLD} visible messages for 5 consecutive minutes.`,
        metric: queue.metricApproximateNumberOfMessagesVisible({ statistic: Stats.MAXIMUM, period: ONE_MINUTE }),
        threshold: QUEUE_DEPTH_THRESHOLD,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 5,
        datapointsToAlarm: 5,
        alertTopic,
      });
    }
    
    this.addAlarm({
      id: constructNamingHelper('rateLimitEnforcedAlarm', group),
      name: namingHelper(PRIORITY_HIGH, group, 'DispatchRateLimitingEnforced'),
      description: `Dispatch circuit breaker enforced rate limiting for 2 consecutive minutes.`,
      metric: customMetric(METRIC.CIRCUIT_BREAKER_RATE_LIMITING_ENFORCED, Stats.MAXIMUM, ONE_MINUTE),
      threshold: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      alertTopic,
    });
    
    this.addRateAlarm({
      id: constructNamingHelper('validationFailureRateAlarm', group),
      name: namingHelper(PRIORITY_HIGH, group, 'ValidationFailureRateHigh'),
      description: `Validation failure rate exceeded ${FAILURE_RATE_THRESHOLD}% over a 5-minute window.`,
      failed: customMetric(METRIC.ANALYTICS_EVENT_VALIDATION_FAILED, Stats.SUM),
      total: customMetric(METRIC.ANALYTICS_EVENT_VALIDATING, Stats.SUM),
      label: 'validation failure rate (%)',
      alertTopic,
    });
    
    this.addRateAlarm({
      id: constructNamingHelper('processingFailureRateAlarm', group),
      name: namingHelper(PRIORITY_HIGH, group, 'ProcessingFailureRateHigh'),
      description: `Processing failure rate exceeded ${FAILURE_RATE_THRESHOLD}% over a 5-minute window.`,
      failed: customMetric(METRIC.ANALYTICS_EVENT_PROCESSING_FAILED, Stats.SUM),
      total: customMetric(METRIC.ANALYTICS_EVENT_PROCESSING, Stats.SUM),
      label: 'processing failure rate (%)',
      alertTopic,
    });
    
    this.addRateAlarm({
      id: constructNamingHelper('dispatchFailureRateAlarm', group),
      name: namingHelper(PRIORITY_HIGH, group, 'DispatchFailureRateHigh'),
      description: `Dispatch failure rate exceeded ${FAILURE_RATE_THRESHOLD}% over a 5-minute window.`,
      failed: customMetric(METRIC.ANALYTICS_EVENT_DISPATCHING_FAILED, Stats.SUM),
      total: customMetric(METRIC.ANALYTICS_EVENT_DISPATCHING, Stats.SUM),
      label: 'dispatch failure rate (%)',
      alertTopic,
    });
    
    this.addAlarm({
      id: constructNamingHelper('processingDurationAlarm', group),
      name: namingHelper(PRIORITY_HIGH, group, 'ProcessingDurationP95High'),
      description: `Processing p95 duration exceeded ${PROCESSING_DURATION_P95_MS} ms over a 5-minute window.`,
      metric: customMetric(METRIC.PROCESSING_DURATION, P95, FIVE_MINUTES),
      threshold: PROCESSING_DURATION_P95_MS,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      alertTopic,
    });
    
    this.addAlarm({
      id: constructNamingHelper('dispatchDurationAlarm', group),
      name: namingHelper(PRIORITY_HIGH, group, 'DispatchDurationP95High'),
      description: `Dispatch p95 duration exceeded ${DISPATCH_DURATION_P95_MS} ms over a 5-minute window.`,
      metric: customMetric(METRIC.DISPATCH_DURATION, P95, FIVE_MINUTES),
      threshold: DISPATCH_DURATION_P95_MS,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      alertTopic,
    });
    
    const batchFailureTargets = [
      { id: 'validationBatchFailuresAlarm', metric: METRIC.BATCH_ITEM_FAILURES_VALIDATION, title: 'ValidationBatchItemFailures', label: 'Validation' },
      { id: 'processingBatchFailuresAlarm', metric: METRIC.BATCH_ITEM_FAILURES_PROCESSING, title: 'ProcessingBatchItemFailures', label: 'Processing' },
      { id: 'dispatchBatchFailuresAlarm', metric: METRIC.BATCH_ITEM_FAILURES_DISPATCH, title: 'DispatchBatchItemFailures', label: 'Dispatch' },
    ];
    
    for (const target of batchFailureTargets) {
      this.addAlarm({
        id: constructNamingHelper(target.id, group),
        name: namingHelper(PRIORITY_MEDIUM, group, target.title),
        description: `${target.label} batch item failures detected for 2 consecutive minutes.`,
        metric: customMetric(target.metric, Stats.SUM, ONE_MINUTE),
        threshold: ZERO,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 2,
        datapointsToAlarm: 2,
        alertTopic,
        });
      }
      
    const publishFailureTargets = [
      { id: 'processingPublishFailuresAlarm', metric: METRIC.QUEUE_PROCESSING_PUBLISHED_FAILED, title: 'ProcessingQueuePublishFailed', label: 'processing' },
      { id: 'dispatchPublishFailuresAlarm', metric: METRIC.QUEUE_DISPATCH_PUBLISHED_FAILED, title: 'DispatchQueuePublishFailed', label: 'dispatch' },
      { id: 'analyticsPublishFailuresAlarm', metric: METRIC.QUEUE_ANALYTICS_PUBLISHED_FAILED, title: 'AnalyticsQueuePublishFailed', label: 'analytics' },
    ];
    
    for (const target of publishFailureTargets) {
      this.addAlarm({
        id: constructNamingHelper(target.id, group),
        name: namingHelper(PRIORITY_MEDIUM, group, target.title),
        description: `Failed to publish to the ${target.label} queue within a 1-minute period.`,
        metric: customMetric(target.metric, Stats.SUM, ONE_MINUTE),
        threshold: ZERO,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        alertTopic,
      });
    }
  }
  
  private addAlarm(props: {
    id: string;
    name: string;
    description: string;
    metric: IMetric;
    threshold: number;
    comparisonOperator: ComparisonOperator;
    evaluationPeriods: number;
    datapointsToAlarm: number;
    alertTopic: ITopic;
    }): Alarm {
      const alarm = new Alarm(this, props.id, {
        alarmName: props.name,
        alarmDescription: props.description,
        metric: props.metric,
        threshold: props.threshold,
        comparisonOperator: props.comparisonOperator,
        evaluationPeriods: props.evaluationPeriods,
        datapointsToAlarm: props.datapointsToAlarm,
        treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    
    alarm.addAlarmAction(new SnsAction(props.alertTopic));
    this.alarms.push(alarm);
    return alarm;
  }
  
  private addRateAlarm(props: {
    id: string;
    name: string;
    description: string;
    failed: IMetric;
    total: IMetric;
    label: string;
    alertTopic: ITopic;
  }): Alarm {
    const failureRate = new MathExpression({
      expression: '(failed / total) * 100',
      usingMetrics: { failed: props.failed, total: props.total },
      period: FIVE_MINUTES,
      label: props.label,
    });
    
    return this.addAlarm({
      id: props.id,
      name: props.name,
      description: props.description,
      metric: failureRate,
      threshold: FAILURE_RATE_THRESHOLD,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      alertTopic: props.alertTopic,
    });
  }
}
