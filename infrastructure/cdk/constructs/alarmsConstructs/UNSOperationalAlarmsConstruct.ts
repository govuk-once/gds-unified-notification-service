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
import { MetricsLabels } from "../../../../src/common/services/observabilityService";
import { AlarmPeriod, alarmPriority, metricDimensions, OperationalAlarmThreshold, P95_STATISTIC, ZERO_THRESHOLD } from "./UNSAlarmConstructs";

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
    
    const metricNamespace = (config: EnvVars): string => `NOTIFICATIONS_${config.project}-${config.env}`.toUpperCase().replace('-', '_');
    const namespace = metricNamespace(config);
    const dimensionsMap = metricDimensions(config, group);
      
    const customMetric = (metricName: string, statistic: string, period: Duration = AlarmPeriod.FIVE_MINUTES): Metric =>
      new Metric({ namespace, metricName, dimensionsMap, statistic, period });
      
    for (const { name, queue } of queues) {
      this.addAlarm({
        id: constructNamingHelper('sqsDepthAlarm', group, name),
        name: namingHelper(alarmPriority.HIGH, group, 'SqsQueueDepthHigh', name),
        description: `SQS queue '${name}' exceeded ${OperationalAlarmThreshold.QUEUE_DEPTH} visible messages for 5 consecutive minutes.`,
        metric: queue.metricApproximateNumberOfMessagesVisible({ statistic: Stats.MAXIMUM, period: AlarmPeriod.ONE_MINUTE }),
        threshold: OperationalAlarmThreshold.QUEUE_DEPTH,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 5,
        datapointsToAlarm: 5,
        alertTopic,
      });
    }
    
    this.addAlarm({
      id: constructNamingHelper('rateLimitEnforcedAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'DispatchRateLimitingEnforced'),
      description: `Dispatch circuit breaker enforced rate limiting for 2 consecutive minutes.`,
      metric: customMetric(MetricsLabels.CIRCUIT_BREAKER_RATE_LIMITING_ENFORCED, Stats.MAXIMUM, AlarmPeriod.ONE_MINUTE),
      threshold: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      alertTopic,
    });
    
    this.addRateAlarm({
      id: constructNamingHelper('validationFailureRateAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'ValidationFailureRateHigh'),
      description: `Validation failure rate exceeded ${OperationalAlarmThreshold.FAILURE_RATE_PERCENTAGE}% over a 5-minute window.`,
      failed: customMetric(MetricsLabels.ANALYTICS_EVENT_VALIDATION_FAILED, Stats.SUM),
      total: customMetric(MetricsLabels.ANALYTICS_EVENT_VALIDATING, Stats.SUM),
      label: 'validation failure rate (%)',
      alertTopic,
    });
    
    this.addRateAlarm({
      id: constructNamingHelper('processingFailureRateAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'ProcessingFailureRateHigh'),
      description: `Processing failure rate exceeded ${OperationalAlarmThreshold.FAILURE_RATE_PERCENTAGE}% over a 5-minute window.`,
      failed: customMetric(MetricsLabels.ANALYTICS_EVENT_PROCESSING_FAILED, Stats.SUM),
      total: customMetric(MetricsLabels.ANALYTICS_EVENT_PROCESSING, Stats.SUM),
      label: 'processing failure rate (%)',
      alertTopic,
    });
    
    this.addRateAlarm({
      id: constructNamingHelper('dispatchFailureRateAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'DispatchFailureRateHigh'),
      description: `Dispatch failure rate exceeded ${OperationalAlarmThreshold.PROCESSING_DURATION_P95_MS}% over a 5-minute window.`,
      failed: customMetric(MetricsLabels.ANALYTICS_EVENT_DISPATCHING_FAILED, Stats.SUM),
      total: customMetric(MetricsLabels.ANALYTICS_EVENT_DISPATCHING, Stats.SUM),
      label: 'dispatch failure rate (%)',
      alertTopic,
    });
    
    this.addAlarm({
      id: constructNamingHelper('processingDurationAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'ProcessingDurationP95High'),
      description: `Processing p95 duration exceeded ${OperationalAlarmThreshold.PROCESSING_DURATION_P95_MS} ms over a 5-minute window.`,
      metric: customMetric(MetricsLabels.PROCESSING_DURATION, P95_STATISTIC, AlarmPeriod.FIVE_MINUTES),
      threshold: OperationalAlarmThreshold.PROCESSING_DURATION_P95_MS,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      alertTopic,
    });
    
    this.addAlarm({
      id: constructNamingHelper('dispatchDurationAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'DispatchDurationP95High'),
      description: `Dispatch p95 duration exceeded ${OperationalAlarmThreshold.PROCESSING_DURATION_P95_MS} ms over a 5-minute window.`,
      metric: customMetric(MetricsLabels.DISPATCH_DURATION, P95_STATISTIC, AlarmPeriod.FIVE_MINUTES),
      threshold: OperationalAlarmThreshold.PROCESSING_DURATION_P95_MS,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      alertTopic,
    });
    
    const batchFailureTargets = [
      { id: 'validationBatchFailuresAlarm', metric: MetricsLabels.BATCH_ITEM_FAILURES_VALIDATION, title: 'ValidationBatchItemFailures', label: 'Validation' },
      { id: 'processingBatchFailuresAlarm', metric: MetricsLabels.BATCH_ITEM_FAILURES_PROCESSING, title: 'ProcessingBatchItemFailures', label: 'Processing' },
      { id: 'dispatchBatchFailuresAlarm', metric: MetricsLabels.BATCH_ITEM_FAILURES_DISPATCH, title: 'DispatchBatchItemFailures', label: 'Dispatch' },
    ];
    
    for (const target of batchFailureTargets) {
      this.addAlarm({
        id: constructNamingHelper(target.id, group),
        name: namingHelper(alarmPriority.MEDIUM, group, target.title),
        description: `${target.label} batch item failures detected for 2 consecutive minutes.`,
        metric: customMetric(target.metric, Stats.SUM, AlarmPeriod.ONE_MINUTE),
        threshold: ZERO_THRESHOLD,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 2,
        datapointsToAlarm: 2,
        alertTopic,
        });
      }
      
    const publishFailureTargets = [
      { id: 'processingPublishFailuresAlarm', metric: MetricsLabels.QUEUE_PROCESSING_PUBLISHED_FAILED, title: 'ProcessingQueuePublishFailed', label: 'processing' },
      { id: 'dispatchPublishFailuresAlarm', metric: MetricsLabels.QUEUE_DISPATCH_PUBLISHED_FAILED, title: 'DispatchQueuePublishFailed', label: 'dispatch' },
      { id: 'analyticsPublishFailuresAlarm', metric: MetricsLabels.QUEUE_ANALYTICS_PUBLISHED_FAILED, title: 'AnalyticsQueuePublishFailed', label: 'analytics' },
    ];
    
    for (const target of publishFailureTargets) {
      this.addAlarm({
        id: constructNamingHelper(target.id, group),
        name: namingHelper(alarmPriority.MEDIUM, group, target.title),
        description: `Failed to publish to the ${target.label} queue within a 1-minute period.`,
        metric: customMetric(target.metric, Stats.SUM, AlarmPeriod.ONE_MINUTE),
        threshold: ZERO_THRESHOLD,
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
      expression: '(FILL(failed, 0) / total) * 100',
      usingMetrics: { failed: props.failed, total: props.total },
      period: AlarmPeriod.FIVE_MINUTES,
      label: props.label,
    });
    
    return this.addAlarm({
      id: props.id,
      name: props.name,
      description: props.description,
      metric: failureRate,
      threshold: OperationalAlarmThreshold.FAILURE_RATE_PERCENTAGE,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      alertTopic: props.alertTopic,
    });
  }
}
