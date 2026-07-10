import { Duration } from "aws-cdk-lib";
import { RestApi } from "aws-cdk-lib/aws-apigateway";
import { Alarm, ComparisonOperator, IMetric, MathExpression, Stats, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { ITopic } from "aws-cdk-lib/aws-sns";
import { Construct } from 'constructs';
import { EnvVars } from "infrastructure/cdk/config";

const PRIORITY_SERVER_ERROR = 'P2';
const PRIORITY_CLIENT_ERROR = 'P3';

const SERVER_ERROR_RATE_THRESHOLD = 1;
const CLIENT_ERROR_RATE_THRESHOLD = 10;

const ALARM_PERIOD = Duration.minutes(5);

interface UNSApiGatewayAlarmsProps {
  restApi: RestApi,
  alertTopic: ITopic,
  group: string;
}

export class UNSApiGatewayAlarmsConstruct extends Construct {
  public readonly serverErrorRateAlarm: Alarm;
  public readonly clientErrorRateAlarm: Alarm;

  constructor(scope: Construct, config: EnvVars, props: UNSApiGatewayAlarmsProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    super(scope, constructNamingHelper('apigw', 'alarms', props.group));

    const { restApi, alertTopic, group } = props;

    const requests = restApi.metricCount({ statistic: Stats.SUM, period: ALARM_PERIOD });

    this.serverErrorRateAlarm = this.buildRateAlarm(config, {
      id: constructNamingHelper('api5xxRateAlarm', group),
      name: namingHelper(PRIORITY_SERVER_ERROR, group, 'Api5xxErrorRateElevated'), 
      description: `API 5xx error rate for ${group} exceeded ${SERVER_ERROR_RATE_THRESHOLD}% of requests over a 5-minute window.`,
      errors: restApi.metricServerError({ statistic: Stats.SUM, period: ALARM_PERIOD }), 
      requests,
      threshold: SERVER_ERROR_RATE_THRESHOLD, 
      label: '5xx error rate (%)', 
      alertTopic,
    });

    this.clientErrorRateAlarm = this.buildRateAlarm(config, {
      id: constructNamingHelper('api4xxRateAlarm', group),
      name: namingHelper(PRIORITY_CLIENT_ERROR, group, 'Api4xxErrorRateElevated'), 
      description: `API 4xx error rate for ${group} exceeded ${PRIORITY_CLIENT_ERROR}% of requests over a 5-minute window.`,
      errors: restApi.metricServerError({ statistic: Stats.SUM, period: ALARM_PERIOD }), 
      requests,
      threshold: CLIENT_ERROR_RATE_THRESHOLD, 
      label: '4xx error rate (%)', 
      alertTopic,
    });
  }

  private buildRateAlarm(config: EnvVars, props: { 
    id: string; 
    name: string; 
    description: string; 
    errors: IMetric; 
    requests: IMetric; 
    threshold: number; 
    label: string; 
    alertTopic: ITopic; }): Alarm {
      const errorRate = new MathExpression({
        expression: '(errors / requests) * 100',
        usingMetrics: { errors: props.errors, requests: props.requests },
        period: ALARM_PERIOD,
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
