import { MetricsLabels, ProviderKey } from '@common/services/observabilityService';
import {
  Alarm,
  ComparisonOperator,
  Metric,
  Stats,
} from 'aws-cdk-lib/aws-cloudwatch';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { AlarmPeriod, alarmPriority, metricDimensions, UNSAlarmsConstruct, UNSAlarmsProps } from "./UNSAlarmConstructs";

export const IntegrationAlarmThreshold = {
  PROVIDER_HTTP_ERROR_RATE_PERCENTAGE: 40,
  LAMBDA_ERROR_RATE_PERCENT: 1,
} as const;

export const providerMetricDimensions = (
  config: EnvVars,
  group: string, 
  provider: string
): Record<string, string> => ({
  ...metricDimensions(config, group),
  [ProviderKey]: provider
});

interface ProviderTarget {
  name: string;
  provider: string; 
  direction: 'upstream' | 'downstream';
}

interface LambdaTarget {
  name: string;
  func: IFunction;
}

interface UNSIntegrationAlarmsProps extends UNSAlarmsProps {
  providers?: ProviderTarget[];
  lambdas: LambdaTarget[];
}

export class UNSIntegrationAlarmsConstruct extends UNSAlarmsConstruct {
  public readonly alarms: Alarm[] = [];

  constructor(scope: Construct, config: EnvVars, props: UNSIntegrationAlarmsProps) {
    const { namingHelper, constructNamingHelper } = config.utils;

    props.names = [...(props.names ?? []), 'integration']
    super(scope, config, props);

    const { group, providers = [], lambdas } = props;
    
    const namespace = `NOTIFICATIONS_${config.project}-${config.env}`.toUpperCase().replace('-', '_');

    for(const  { name, provider, direction } of providers) {
      const dimensionsMap = providerMetricDimensions(config, group, provider);
      const providerMetric = (metricName: string): Metric => new Metric({ namespace, metricName, dimensionsMap, statistic: Stats.SUM, period: AlarmPeriod.ONE_MINUTE});

      // Upstream OneSignal and Downstream UDP
      this.addRateAlarm({
        id: constructNamingHelper('providerHttpErrorRateAlarm', group, provider),
        name: namingHelper(alarmPriority.EXTRA_HIGH, group, `${name}Offline`), 
        description: `${name} (${direction}) HTTP error rate exceeded ${IntegrationAlarmThreshold.PROVIDER_HTTP_ERROR_RATE_PERCENTAGE}% over a 1-minute window`,
        failed: providerMetric(MetricsLabels.PROVIDER_HTTP_ERRORS), 
        total: providerMetric(MetricsLabels.PROVIDER_HTTP_CALLS), 
        threshold: IntegrationAlarmThreshold.PROVIDER_HTTP_ERROR_RATE_PERCENTAGE, 
        label: `${name} HTTP error rate (%)`,
      });
    }

    // Circuit Breaker 
    this.addAlarm({
        id: constructNamingHelper('circuitBreakerOpenAlarm', group),
        name: namingHelper(alarmPriority.EXTRA_HIGH, group, 'CircuitBreakerOpen'), 
        description: 'Circuit breaker entered the open state',
        metric: new Metric({
          namespace, 
          metricName: MetricsLabels.CIRCUIT_BREAKER_STATE,
          dimensionsMap: metricDimensions(config, group),
          statistic: Stats.MAXIMUM,
          period: AlarmPeriod.ONE_MINUTE
        }),
        threshold: 1, 
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        datapointsToAlarm: 1, 
      });
    
    // Per Lambda error rate 
    for (const { name, func } of lambdas){
      this.addRateAlarm({
        id: constructNamingHelper('lambdaErrorRateAlarm', group, name),
        name: namingHelper(alarmPriority.HIGH, group, 'LambdaErrorRateElevated', name), 
        description: `Lambda ${name} error rate exceeded ${IntegrationAlarmThreshold.LAMBDA_ERROR_RATE_PERCENT}% over a 5 minute window`,
        failed: func.metricErrors({ statistic: Stats.SUM, period: AlarmPeriod.FIVE_MINUTES }),
        total: func.metricInvocations({ statistic: Stats.SUM, period: AlarmPeriod.FIVE_MINUTES }),
        threshold: IntegrationAlarmThreshold.LAMBDA_ERROR_RATE_PERCENT,
        label: `${name} error rate (%)`, 
      });
    }
  }
}
