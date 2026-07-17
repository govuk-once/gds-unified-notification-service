import { RestApi } from "aws-cdk-lib/aws-apigateway";
import { Alarm, Stats } from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from 'constructs';
import { EnvVars } from "infrastructure/cdk/config";
import { AlarmPeriod, alarmPriority, UNSAlarmsConstruct, UNSAlarmsProps } from "./UNSAlarmConstructs";

export const ApiGatewayAlarmThreshold = {
  SERVER_ERROR_RATE_PERCENT: 1,
  CLIENT_ERROR_RATE_PERCENTAGE: 10,
} as const;

interface UNSApiGatewayAlarmsProps extends UNSAlarmsProps {
  restApi: RestApi;
}

export class UNSApiGatewayAlarmsConstruct extends UNSAlarmsConstruct {
  public readonly serverErrorRateAlarm: Alarm;
  public readonly clientErrorRateAlarm: Alarm;

  constructor(scope: Construct, config: EnvVars, props: UNSApiGatewayAlarmsProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    props.names = [...(props.names ?? []), 'apigw']
    super(scope, config, props);

    const { restApi, group } = props;
    const requests = restApi.metricCount({ statistic: Stats.SUM, period: AlarmPeriod.FIVE_MINUTES });

    // Rate alarm for server errors
    this.serverErrorRateAlarm = this.addRateAlarm({
      id: constructNamingHelper('api5xxRateAlarm', group),
      name: namingHelper(alarmPriority.EXTRA_HIGH, group, 'Api5xxErrorRateElevated'), 
      description: `API 5xx error rate for ${group} exceeded ${ApiGatewayAlarmThreshold.SERVER_ERROR_RATE_PERCENT}% of requests over a 5-minute window.`,
      failed: restApi.metricServerError({ statistic: Stats.SUM, period: AlarmPeriod.FIVE_MINUTES }), 
      total: requests,
      threshold: ApiGatewayAlarmThreshold.SERVER_ERROR_RATE_PERCENT, 
      label: '5xx error rate (%)',
    });

    // Rate alarm for client errors
    this.clientErrorRateAlarm = this.addRateAlarm({
      id: constructNamingHelper('api4xxRateAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'Api4xxErrorRateElevated'), 
      description: `API 4xx error rate for ${group} exceeded ${ApiGatewayAlarmThreshold.CLIENT_ERROR_RATE_PERCENTAGE}% of requests over a 5-minute window.`,
      failed: restApi.metricClientError({ statistic: Stats.SUM, period: AlarmPeriod.FIVE_MINUTES }), 
      total: requests,
      threshold: ApiGatewayAlarmThreshold.CLIENT_ERROR_RATE_PERCENTAGE, 
      label: '4xx error rate (%)',
    });
  }
}
