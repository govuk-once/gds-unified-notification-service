import { RestApi } from "aws-cdk-lib/aws-apigateway";
import { Alarm, ComparisonOperator, IMetric, MathExpression, Stats, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { ITopic } from "aws-cdk-lib/aws-sns";
import { Construct } from 'constructs';
import { EnvVars } from "infrastructure/cdk/config";
import { AlarmPeriod, alarmPriority, ApiGatewayAlarmThreshold } from "./UNSAlarmConstructs";

interface UNSApiGatewayAlarmsProps {
  restApi: RestApi;
  alertTopic: ITopic;
  group: string;
}

export class UNSApiGatewayAlarmsConstruct extends Construct {
  public readonly serverErrorRateAlarm: Alarm;
  public readonly clientErrorRateAlarm: Alarm;

  constructor(scope: Construct, config: EnvVars, props: UNSApiGatewayAlarmsProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    super(scope, constructNamingHelper('apigw', 'alarms', props.group));

    const { restApi, alertTopic, group } = props;

    const requests = restApi.metricCount({ statistic: Stats.SUM, period: AlarmPeriod.FIVE_MINUTES });

    this.serverErrorRateAlarm = this.buildRateAlarm({
      id: constructNamingHelper('api5xxRateAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'Api5xxErrorRateElevated'), 
      description: `API 5xx error rate for ${group} exceeded ${ApiGatewayAlarmThreshold.SERVER_ERROR_RATE_PERCENT}% of requests over a 5-minute window.`,
      errors: restApi.metricServerError({ statistic: Stats.SUM, period: AlarmPeriod.FIVE_MINUTES }), 
      requests,
      threshold: ApiGatewayAlarmThreshold.SERVER_ERROR_RATE_PERCENT, 
      label: '5xx error rate (%)', 
      alertTopic,
    });

    this.clientErrorRateAlarm = this.buildRateAlarm({
      id: constructNamingHelper('api4xxRateAlarm', group),
      name: namingHelper(alarmPriority.MEDIUM, group, 'Api4xxErrorRateElevated'), 
      description: `API 4xx error rate for ${group} exceeded ${ApiGatewayAlarmThreshold.CLIENT_ERROR_RATE_PERCENTAGE}% of requests over a 5-minute window.`,
      errors: restApi.metricClientError({ statistic: Stats.SUM, period: AlarmPeriod.FIVE_MINUTES }), 
      requests,
      threshold: ApiGatewayAlarmThreshold.CLIENT_ERROR_RATE_PERCENTAGE, 
      label: '4xx error rate (%)', 
      alertTopic,
    });
  }

  private buildRateAlarm(props: { 
    id: string; 
    name: string; 
    description: string; 
    errors: IMetric; 
    requests: IMetric; 
    threshold: number; 
    label: string; 
    alertTopic: ITopic;}): Alarm {
      const errorRate = new MathExpression({
        expression: '(FILL(errors, 0) / requests) * 100',
        usingMetrics: { errors: props.errors, requests: props.requests },
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
      
      alarm.addAlarmAction(new SnsAction(props.alertTopic));
      return alarm; 
    }
}
