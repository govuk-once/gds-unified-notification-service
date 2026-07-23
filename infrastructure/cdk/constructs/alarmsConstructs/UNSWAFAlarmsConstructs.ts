import { Duration, Stack } from 'aws-cdk-lib';
import { ComparisonOperator, Metric, Stats } from 'aws-cdk-lib/aws-cloudwatch';
import { CfnWebACL } from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import {
  AlarmPeriod,
  alarmPriority,
  UNSAlarmsConstruct,
  UNSAlarmsProps,
} from 'infrastructure/cdk/constructs/alarmsConstructs/UNSAlarmConstructs';

export const wafMetric = {
  BLOCKED_REQUESTS: 'BlockedRequests',
};

export interface UNSWAFAlarmProps extends UNSAlarmsProps {
  waf: CfnWebACL;
}

export class UNSWAFAlarmsConstruct extends UNSAlarmsConstruct {
  constructor(scope: Construct, config: EnvVars, props: UNSWAFAlarmProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    props.names = [...(props.names ?? []), 'waf'];
    super(scope, config, props);

    const { group } = props;

    // WAF Blocked Request Spike
    const blockRequestMetric = this.constructWafMetric(props.waf, wafMetric.BLOCKED_REQUESTS, Stats.SUM);
    if (blockRequestMetric) {
      this.addAnomalyDetectionAlarm({
        id: constructNamingHelper('wafBlockRequestAlarm', group),
        name: namingHelper(alarmPriority.HIGH, group, 'WafBlockRequestSpike'),
        description: `Waf blocked request spike detected for 5 minutes.`,
        metric: blockRequestMetric,
        stdDevs: 3,
        comparisonOperator: ComparisonOperator.GREATER_THAN_UPPER_THRESHOLD,
      });
    }
  }

  private constructWafMetric(
    waf: CfnWebACL,
    metricName: string,
    statistic: string,
    period: Duration = AlarmPeriod.FIVE_MINUTES
  ): Metric | undefined {
    if (!waf.name) {
      return undefined;
    }
    return new Metric({
      namespace: 'AWS/WAFV2',
      metricName: metricName,
      dimensionsMap: {
        WebACL: waf.name,
        Region: Stack.of(this).region,
        Rule: 'ALL',
      },
      statistic: statistic,
      period: period,
    });
  }
}
