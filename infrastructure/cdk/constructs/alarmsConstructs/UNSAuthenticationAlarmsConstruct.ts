import { MetricsLabels } from '@common/services';
import { ComparisonOperator, Stats } from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import {
  AlarmPeriod,
  alarmPriority,
  numericThreshold,
  UNSAlarmsConstruct,
  UNSAlarmsProps,
} from 'infrastructure/cdk/constructs/alarmsConstructs/UNSAlarmConstructs';

export const AuthenticationAlarmThreshold = {
  DENIAL_RATE_PERCENTAGE: 0.1,
};

export class UNSAuthenticationAlarmsConstruct extends UNSAlarmsConstruct {
  constructor(scope: Construct, config: EnvVars, props: UNSAlarmsProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    props.names = [...(props.names ?? []), 'authentication'];
    super(scope, config, props);

    const { group } = props;

    // MTLS Denial Rate Alarm
    this.addRateAlarm({
      id: constructNamingHelper('mTLSDenialRateAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'MTLSDenialRateHigh'),
      description: `mTLS denial rate exceeded ${AuthenticationAlarmThreshold.DENIAL_RATE_PERCENTAGE}% over a 5-minute window.`,
      failed: this.customMetric(MetricsLabels.MTLS_AUTH_REQUESTS_DENIED_COUNT, Stats.SUM),
      total: this.customMetric(MetricsLabels.MTLS_AUTH_REQUESTS_COUNT, Stats.SUM),
      threshold: AuthenticationAlarmThreshold.DENIAL_RATE_PERCENTAGE,
      label: 'denial rate (%)',
    });

    // Revoked Certificate Detected Alarm
    this.addAlarm({
      id: constructNamingHelper('revokedCertificateAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'RevokedCertificateDetected'),
      description: `Revoked Certificate Detected.`,
      metric: this.customMetric(MetricsLabels.MTLS_AUTH_REQUESTS_DENIED_REVOKED_CERTIFICATE_COUNT, Stats.MAXIMUM),
      threshold: numericThreshold.ZERO_THRESHOLD,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
    });

    // Unknown Certificate Spike
    this.addAlarm({
      id: constructNamingHelper('unknownCertificateSpikeAlarm', group),
      name: namingHelper(alarmPriority.HIGH, group, 'UnknownCertificateSpikeDetected'),
      description: `A spike in unknown certificates has been detected over a 5-minute window.`,
      metric: this.customMetric(
        MetricsLabels.MTLS_AUTH_REQUESTS_DENIED_UNKNOWN_CERTIFICATE_COUNT,
        Stats.SUM,
        AlarmPeriod.FIVE_MINUTES
      ),
      threshold: numericThreshold.FIVE_THRESHOLD,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 5,
      datapointsToAlarm: 5,
    });
  }
}
