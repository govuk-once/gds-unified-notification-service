import { EnvVars } from '@infra/cdk/config';
import { ComparisonOperator, Metric, Stats, Unit } from 'aws-cdk-lib/aws-cloudwatch';
import { Rule } from 'aws-cdk-lib/aws-events';
import { CloudWatchLogGroup as CWLTarget } from 'aws-cdk-lib/aws-events-targets';
import { FilterPattern, LogGroup, MetricFilter } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { AlarmPeriod, alarmPriority, UNSAlarmsConstruct, UNSAlarmsProps } from './UNSAlarmConstructs';

export const SecurityAlarmThreshold = {
  LAMBDA_THROTTLE_COUNT: 0,
  LAMBDA_TIMEOUT_PROXIMITY_PERCENT: 90,
  LAMBDA_CONCURRENCY_ANOMALY_STD_DEVS: 3,
  IAM_ACCESS_DENIED_COUNT: 5,
  LAMBDA_UNQUALIFIED_INVOCATION_COUNT: 1,
} as const;

interface LambdaTarget {
  name: string;
  functionName: string;
  timeoutMs: number;
}

interface UNSSecurityAlarmsProps extends UNSAlarmsProps {
  lambdas: LambdaTarget[];
  /**
   * When true, creates the IAM AccessDenied detection: an EventBridge rule that routes matching
   * CloudTrail management events into an owned log group, with a metric filter and alarm on top.
   * Pass only once per stack (PSO) — this is an account-level detection and creating it in both
   * PSO and Flex constructs would produce duplicate rules and double-count every event.
   */
  includeAccountScopedAlarms?: boolean;
}

export class UNSSecurityAlarmsConstruct extends UNSAlarmsConstruct {
  constructor(scope: Construct, config: EnvVars, props: UNSSecurityAlarmsProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    props.names = [...(props.names ?? []), 'security'];
    super(scope, config, props);

    const { group, lambdas, includeAccountScopedAlarms } = props;
    const metricNamespace = `NOTIFICATIONS_${config.project}-${config.env}`.toUpperCase().replace('-', '_');

    for (const { name, functionName, timeoutMs } of lambdas) {
      const timeoutProximityMs = Math.round(
        (timeoutMs * SecurityAlarmThreshold.LAMBDA_TIMEOUT_PROXIMITY_PERCENT) / 100
      );
      // Lambda throttling — fires when any throttle is sustained across two consecutive minutes
      this.addAlarm({
        id: constructNamingHelper('lambdaThrottlingAlarm', group, name),
        name: namingHelper(alarmPriority.HIGH, group, 'LambdaThrottlingDetected', name),
        description: `Lambda ${name} is being throttled. Requests are being rejected due to concurrency limits.`,
        metric: new Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Throttles',
          dimensionsMap: { FunctionName: functionName },
          statistic: Stats.SUM,
          period: AlarmPeriod.ONE_MINUTE,
        }),
        threshold: SecurityAlarmThreshold.LAMBDA_THROTTLE_COUNT,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 2,
        datapointsToAlarm: 2,
      });

      // Lambda timeout proximity — fires when maximum duration approaches the 30s hard timeout
      this.addAlarm({
        id: constructNamingHelper('lambdaTimeoutProximityAlarm', group, name),
        name: namingHelper(alarmPriority.HIGH, group, 'LambdaTimeoutProximityDetected', name),
        description: `Lambda ${name} maximum execution duration exceeded ${timeoutProximityMs}ms (${SecurityAlarmThreshold.LAMBDA_TIMEOUT_PROXIMITY_PERCENT}% of its ${timeoutMs}ms timeout).`,
        metric: new Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: functionName },
          statistic: Stats.MAXIMUM,
          period: AlarmPeriod.ONE_MINUTE,
        }),
        threshold: timeoutProximityMs,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 2,
        datapointsToAlarm: 2,
      });

      // Lambda concurrency anomaly — fires when concurrent executions spike beyond expected baseline
      this.addAnomalyDetectionAlarm({
        id: constructNamingHelper('lambdaConcurrencyAnomalyAlarm', group, name),
        name: namingHelper(alarmPriority.HIGH, group, 'LambdaConcurrencyAnomalyDetected', name),
        description: `Lambda ${name} concurrent executions deviated more than ${SecurityAlarmThreshold.LAMBDA_CONCURRENCY_ANOMALY_STD_DEVS}σ from the expected baseline.`,
        metric: new Metric({
          namespace: 'AWS/Lambda',
          metricName: 'ConcurrentExecutions',
          dimensionsMap: { FunctionName: functionName },
          statistic: Stats.MAXIMUM,
          period: AlarmPeriod.FIVE_MINUTES,
        }),
        stdDevs: SecurityAlarmThreshold.LAMBDA_CONCURRENCY_ANOMALY_STD_DEVS,
        comparisonOperator: ComparisonOperator.GREATER_THAN_UPPER_THRESHOLD,
      });

      // $LATEST invocation detection via the Lambda function's own log group.
      // Powertools logs functionVersion on every invocation. When invoked through an alias it
      // resolves to the pinned version number; "$LATEST" only appears when the function is called
      // without a qualifier. This avoids any CloudTrail data events dependency.
      const lambdaLogGroup = LogGroup.fromLogGroupName(
        this,
        constructNamingHelper('unqualifiedInvocationLg', group, name),
        `/aws/lambda/${functionName}`
      );

      const unqualifiedInvocationFilter = new MetricFilter(
        this,
        constructNamingHelper('unqualifiedInvocationFilter', group, name),
        {
          logGroup: lambdaLogGroup,
          metricNamespace,
          metricName: 'LambdaUnqualifiedInvocation',
          filterPattern: FilterPattern.literal('{ $.functionVersion = "$LATEST" }'),
          metricValue: '1',
          defaultValue: 0,
          unit: Unit.COUNT,
        }
      );

      this.addAlarm({
        id: constructNamingHelper('lambdaUnqualifiedInvocationAlarm', group, name),
        name: namingHelper(alarmPriority.HIGH, group, 'LambdaUnqualifiedInvocationDetected', name),
        description:
          `Lambda ${name} was invoked without a qualifier, targeting $LATEST directly. ` +
          `All legitimate invocations use a versioned alias — any unqualified invocation indicates unexpected direct access.`,
        metric: unqualifiedInvocationFilter.metric({
          statistic: Stats.SUM,
          period: AlarmPeriod.FIVE_MINUTES,
        }),
        threshold: SecurityAlarmThreshold.LAMBDA_UNQUALIFIED_INVOCATION_COUNT,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
      });
    }

    // IAM AccessDenied detection — account-scoped, created once (PSO construct only).
    // Uses EventBridge to receive CloudTrail management events into an owned log group, avoiding the
    // need for permissions on an org-level CloudTrail log group.
    if (includeAccountScopedAlarms) {
      const securityEventsLogGroup = new LogGroup(this, constructNamingHelper('securityEventsLogGroup', group), {
        logGroupName: `/aws/events/${namingHelper('security-events')}`,
        retention: config.retention,
        removalPolicy: config.removalPolicy,
      });

      // EventBridge rule: IAM AccessDenied from assumed-role principals → security events log group.
      // Management events are delivered to EventBridge in every member account automatically,
      // regardless of whether the CloudTrail trail is account-level or org-level.
      new Rule(this, constructNamingHelper('iamAccessDeniedRule', group), {
        ruleName: namingHelper('iam-access-denied-rule'),
        description:
          'Routes CloudTrail IAM AccessDenied events from assumed-role principals to the UNS security events log group.',
        eventPattern: {
          detailType: ['AWS API Call via CloudTrail'],
          detail: {
            errorCode: ['AccessDenied', 'AccessDeniedException'],
            userIdentity: {
              type: ['AssumedRole'],
              // Exclude sessions assumed by an AWS service on behalf of a request (e.g. API Gateway
              // assuming an execution role to call KMS). Those principals carry invokedBy set to the
              // service principal. Lambda execution roles and other directly-acting principals do not.
              invokedBy: [{ exists: false }],
            },
          },
        },
        targets: [new CWLTarget(securityEventsLogGroup)],
      });

      // The EventBridge rule above is the gate — only AccessDenied events from AssumedRole principals
      // reach this log group. The filter counts all arrivals; the errorCode check is kept for clarity
      // but every event here will already match it.
      const iamAccessDeniedFilter = new MetricFilter(
        this,
        constructNamingHelper('iamAccessDeniedMetricFilter', group),
        {
          logGroup: securityEventsLogGroup,
          metricNamespace,
          metricName: 'IAMAccessDenied',
          filterPattern: FilterPattern.literal('{ $.detail.errorCode = "AccessDenied" }'),
          metricValue: '1',
          defaultValue: 0,
          unit: Unit.COUNT,
        }
      );

      this.addAlarm({
        id: constructNamingHelper('iamAccessDeniedAlarm', group),
        // No group in the alarm name — this is an account-level detection, not per-service.
        name: namingHelper(alarmPriority.EXTRA_HIGH, 'IAMAccessDeniedRepeated'),
        description:
          `Repeated IAM AccessDenied events detected from assumed-role principals (includes Lambda execution roles). ` +
          `${SecurityAlarmThreshold.IAM_ACCESS_DENIED_COUNT} or more denials within a 5-minute window indicate a potential security incident.`,
        metric: iamAccessDeniedFilter.metric({
          statistic: Stats.SUM,
          period: AlarmPeriod.FIVE_MINUTES,
        }),
        threshold: SecurityAlarmThreshold.IAM_ACCESS_DENIED_COUNT,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
      });
    }
  }
}
