import { EnvVars } from '@infra/cdk/config';
import { Annotations } from 'aws-cdk-lib';
import { ComparisonOperator, Metric, Stats, Unit } from 'aws-cdk-lib/aws-cloudwatch';
import { FilterPattern, LogGroup, MetricFilter } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { AlarmPeriod, alarmPriority, UNSAlarmsConstruct, UNSAlarmsProps } from './UNSAlarmConstructs';

export const SecurityAlarmThreshold = {
  LAMBDA_THROTTLE_COUNT: 0,
  LAMBDA_TIMEOUT_PROXIMITY_MS: 28_000,
  LAMBDA_CONCURRENCY_ANOMALY_STD_DEVS: 3,
  IAM_ACCESS_DENIED_COUNT: 5,
  LAMBDA_UNQUALIFIED_INVOCATION_COUNT: 1,
} as const;

interface LambdaTarget {
  name: string;
  functionName: string;
}

interface UNSSecurityAlarmsProps extends UNSAlarmsProps {
  lambdas: LambdaTarget[];
  /**
   * Name of the CloudWatch Logs log group receiving CloudTrail management events for this account.
   * - `string`    — log group exists; IAM AccessDenied metric filter and alarm are created.
   * - `null`      — SSM parameter not set; a CDK warning is emitted and the alarm is skipped.
   * - `undefined` — detection intentionally not requested for this group (no warning emitted).
   */
  cloudTrailLogGroupName?: string | null;
}

export class UNSSecurityAlarmsConstruct extends UNSAlarmsConstruct {
  constructor(scope: Construct, config: EnvVars, props: UNSSecurityAlarmsProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    props.names = [...(props.names ?? []), 'security'];
    super(scope, config, props);

    const { group, lambdas, cloudTrailLogGroupName } = props;

    for (const { name, functionName } of lambdas) {
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
        description: `Lambda ${name} maximum execution duration exceeded ${SecurityAlarmThreshold.LAMBDA_TIMEOUT_PROXIMITY_MS}ms, approaching the 30s hard timeout.`,
        metric: new Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: functionName },
          statistic: Stats.MAXIMUM,
          period: AlarmPeriod.ONE_MINUTE,
        }),
        threshold: SecurityAlarmThreshold.LAMBDA_TIMEOUT_PROXIMITY_MS,
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
    }

    // IAM AccessDenied detection via CloudTrail log metric filter.
    // Covers all assumed-role principals, which includes every Lambda execution role in this account.
    // Created once per stack (PSO construct) rather than per service, since CloudTrail is account-scoped.
    if (cloudTrailLogGroupName === undefined) {
      // Intentionally not requested for this group — skip silently.
    } else if (!cloudTrailLogGroupName) {
      Annotations.of(this).addWarning(
        `IAM AccessDenied detection is disabled: no CloudTrail trail with CloudWatch Logs enabled was found in region ${config.region}. ` +
          `Enable CloudWatch Logs delivery on an existing trail, or check whether your org-level trail is homed in a different region.`
      );
    } else {
      const cloudTrailLogGroup = LogGroup.fromLogGroupName(
        this,
        constructNamingHelper('cloudTrailLogGroup', group),
        cloudTrailLogGroupName
      );

      const metricFilter = new MetricFilter(this, constructNamingHelper('iamAccessDeniedMetricFilter', group), {
        logGroup: cloudTrailLogGroup,
        metricNamespace: `NOTIFICATIONS_${config.project}-${config.env}`.toUpperCase().replace('-', '_'),
        metricName: 'IAMAccessDenied',
        filterPattern: FilterPattern.literal(
          '{ ($.errorCode = "AccessDenied") && ($.userIdentity.type = "AssumedRole") }'
        ),
        metricValue: '1',
        defaultValue: 0,
        unit: Unit.COUNT,
      });

      this.addAlarm({
        id: constructNamingHelper('iamAccessDeniedAlarm', group),
        // No group in the alarm name — this is an account-level detection, not per-service.
        name: namingHelper(alarmPriority.EXTRA_HIGH, 'IAMAccessDeniedRepeated'),
        description:
          `Repeated IAM AccessDenied events detected from assumed-role principals (includes Lambda execution roles). ` +
          `${SecurityAlarmThreshold.IAM_ACCESS_DENIED_COUNT} or more denials within a 5-minute window indicate a potential security incident.`,
        metric: metricFilter.metric({
          statistic: Stats.SUM,
          period: AlarmPeriod.FIVE_MINUTES,
        }),
        threshold: SecurityAlarmThreshold.IAM_ACCESS_DENIED_COUNT,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
      });

      // $LATEST invocation detection — requires CloudTrail Lambda data events to be enabled on the trail.
      // All legitimate invocations use a versioned alias, so any unqualified invocation is unexpected.
      const latestInvocationFilter = new MetricFilter(
        this,
        constructNamingHelper('lambdaUnqualifiedInvocationMetricFilter', group),
        {
          logGroup: cloudTrailLogGroup,
          metricNamespace: `NOTIFICATIONS_${config.project}-${config.env}`.toUpperCase().replace('-', '_'),
          metricName: 'LambdaUnqualifiedInvocation',
          filterPattern: FilterPattern.literal(
            '{ ($.eventName = "Invoke") && ($.requestParameters.qualifier NOT EXISTS) }'
          ),
          metricValue: '1',
          defaultValue: 0,
          unit: Unit.COUNT,
        }
      );

      this.addAlarm({
        id: constructNamingHelper('lambdaUnqualifiedInvocationAlarm', group),
        name: namingHelper(alarmPriority.HIGH, 'LambdaUnqualifiedInvocationDetected'),
        description:
          `A Lambda function was invoked without a qualifier, targeting $LATEST directly. ` +
          `All legitimate invocations use a versioned alias — any unqualified invocation indicates unexpected direct access.`,
        metric: latestInvocationFilter.metric({
          statistic: Stats.SUM,
          period: AlarmPeriod.FIVE_MINUTES,
        }),
        threshold: SecurityAlarmThreshold.LAMBDA_UNQUALIFIED_INVOCATION_COUNT,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
      });
    }
  }
}
