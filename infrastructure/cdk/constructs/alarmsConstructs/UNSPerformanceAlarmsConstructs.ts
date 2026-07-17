import { ComparisonOperator, Stats } from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from 'constructs';
import { EnvVars } from "infrastructure/cdk/config";
import { AlarmPeriod, alarmPriority, numericThreshold, UNSAlarmsConstruct, UNSAlarmsProps } from "./UNSAlarmConstructs";
import { UNSLambdaConstruct } from "infrastructure/cdk/constructs/bases/UNSLambdaConstruct";

export const PerformanceMetricsLabels = {
  COLD_START: 'ColdStart'
}

interface UNSPerformanceAlarmsProps extends UNSAlarmsProps {
  lambdas: {
    name: string,
    lambda: UNSLambdaConstruct;
  }[]
}

export class UNSPerformanceAlarmsConstructs extends UNSAlarmsConstruct {
  constructor(scope: Construct, config: EnvVars, props: UNSPerformanceAlarmsProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    props.names = [...(props.names ?? []), 'lambda']
    super(scope, config, props);

    const { lambdas, group } = props;

    // Lambda Cold Start Rate Elevated
    for (const item of lambdas) {
      this.addAlarm({
        id: constructNamingHelper('coldStartRateElevatedAlarm', group, item.name),
        name: namingHelper(alarmPriority.EXTRA_HIGH, group, item.name, 'ColdStartRateElevatedDetected'),
        description: `An elevated in the number of cold starts has been detected over a 5-minute window.`,
        metric: this.customMetric(PerformanceMetricsLabels.COLD_START, Stats.SUM, AlarmPeriod.FIVE_MINUTES, item.lambda.fn.functionName),
        threshold: numericThreshold.TWENTY_THRESHOLD,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
      })
    };
  }
}
