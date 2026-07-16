import { Duration } from "aws-cdk-lib";
import { Alarm, AnomalyDetectionAlarm, ComparisonOperator, IMetric, MathExpression, Metric, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { ITopic } from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";
import { EnvVars } from "infrastructure/cdk/config";

export const alarmPriority = {
  EXTRA_HIGH: 'P1',
  HIGH: 'P2',
  MEDIUM: 'P3',
} as const;

export const AlarmPeriod = {
  ONE_MINUTE: Duration.minutes(1),
  FIVE_MINUTES: Duration.minutes(5),
} as const;

export const P95_STATISTIC = 'p95';

export const numericThreshold = {
  ZERO_THRESHOLD: 0,
  FIVE_THRESHOLD: 5,
}

export const metricDimensions = (config: EnvVars, group: string): Record<string, string> => ({
  service: `NOTIFICATIONS_${group}`.toUpperCase().replace('-', '_'), 
  environments: `${config.project}-${config.env}`
});

export interface UNSAlarmsProps {
  alertTopic: ITopic,
  group: string;
  names?: string[]
}

export class UNSAlarmsConstruct extends Construct {
  public readonly alarms: Alarm[] = [];
  private readonly props: UNSAlarmsProps;
  private readonly config: EnvVars;

  constructor(scope: Construct, config: EnvVars, props: UNSAlarmsProps) {
    const { constructNamingHelper } = config.utils;
    super(scope, constructNamingHelper(...(props.names ?? []), 'alarms', props.group));

    this.config = config
    this.props = props
  }

  public customMetric = (metricName: string, statistic: string, period: Duration = AlarmPeriod.FIVE_MINUTES): Metric => {
    const metricNamespace = (config: EnvVars): string => `NOTIFICATIONS_${config.project}-${config.env}`.toUpperCase().replace('-', '_'); 
    const namespace = metricNamespace(this.config);
    const dimensionsMap = metricDimensions(this.config, this.props.group);

    return new Metric({ namespace, metricName, dimensionsMap, statistic, period });
  }

  public addAlarm(props: {
    id: string;
    name: string;
    description: string;
    metric: IMetric;
    threshold: number;
    comparisonOperator: ComparisonOperator;
    evaluationPeriods: number;
    datapointsToAlarm: number;
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
    
    alarm.addAlarmAction(new SnsAction(this.props.alertTopic));
    this.alarms.push(alarm);
    return alarm;
  }

  public addRateAlarm(props: { 
    id: string; 
    name: string; 
    description: string; 
    failed: IMetric; 
    total: IMetric; 
    threshold: number; 
    label: string; 
  }): Alarm {
    const errorRate = new MathExpression({
      expression: '(FILL(failed, 0) / total) * 100',
      usingMetrics: { failed: props.failed, total: props.total },
      period: AlarmPeriod.FIVE_MINUTES,
      label: props.label,
    });

    const alarm = new Alarm(this, props.id, {
      alarmName: props.name,
      alarmDescription: props.description,
      metric: errorRate, 
      threshold: props.threshold,
      evaluationPeriods: 1, 
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD, 
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    alarm.addAlarmAction(new SnsAction(this.props.alertTopic));
    return alarm; 
  }

  public addAnomalyDetectionAlarm(props: { 
    id: string; 
    name: string; 
    description: string; 
    metric: IMetric;
    stdDevs: number,
    comparisonOperator: ComparisonOperator;
  }) {
    const alarm = new AnomalyDetectionAlarm(this, props.id, {
      alarmName: props.name,
      alarmDescription: props.description,
      metric: props.metric,
      stdDevs: props.stdDevs,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: props.comparisonOperator, 
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })

    alarm.addAlarmAction(new SnsAction(this.props.alertTopic));
    return alarm; 
  }
}
