import { Duration } from "aws-cdk-lib";
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

export const ZERO_THRESHOLD = 0;

export const ApiGatewayAlarmThreshold = {
  SERVER_ERROR_RATE_PERCENT: 1,
  CLIENT_ERROR_RATE_PERCENTAGE: 10,
} as const;

export const OperationalAlarmThreshold = {
  QUEUE_DEPTH: 1000, 
  FAILURE_RATE_PERCENTAGE: 5, 
  PROCESSING_DURATION_P95_MS: 3000,
  DISPATCH_DURATION_P95_MS: 5000,
} as const 

export const metricDimensions = (config: EnvVars, group: string): Record<string, string> => ({
  service: `NOTIFICATIONS_${group}`.toUpperCase().replace('-', '_'), 
  environments: `${config.project}-${config.env}`
});
