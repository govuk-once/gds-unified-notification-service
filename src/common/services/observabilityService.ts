import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';

// Coverts all analytics events into a metric
export const analyticsMetricPrefix = `ANALYTICS_EVENT`;
const prefixEnum = <const Prefix extends string, T extends object>(prefix: Prefix, enumerator: T) => {
  return Object.fromEntries(Object.values(enumerator).map((value) => [`${prefix}_${value}`, `${prefix}_${value}`])) as {
    [K in (typeof NotificationStateEnum)[keyof typeof NotificationStateEnum] as `${Prefix}_${K}`]: `${Prefix}_${K}`;
  };
};

export const prefixEvent = (status: NotificationStateEnum) => {
  return `${analyticsMetricPrefix}_${status}`;
};
const AnalyticsEventsLabels = prefixEnum(analyticsMetricPrefix, NotificationStateEnum);

export const MetricsLabels = {
  ...AnalyticsEventsLabels,

  API_CALL_TRIGGERED: 'API_CALL_TRIGGERED',

  BATCH_ITEM_FAILURES_DISPATCH: 'BATCH_ITEM_FAILURES_DISPATCH',
  BATCH_ITEM_FAILURES_PROCESSING: 'BATCH_ITEM_FAILURES_PROCESSING',
  BATCH_ITEM_FAILURES_VALIDATION: 'BATCH_ITEM_FAILURES_VALIDATION',

  CIRCUIT_BREAKER_CURRENT_RATE: 'CIRCUIT_BREAKER_CURRENT_RATE',
  CIRCUIT_BREAKER_CURRENT_RATE_LIMIT: 'CIRCUIT_BREAKER_CURRENT_RATE_LIMIT',
  CIRCUIT_BREAKER_FAILURE: 'CIRCUIT_BREAKER_FAILURE',
  CIRCUIT_BREAKER_STATE: 'CIRCUIT_BREAKER_STATE',
  CIRCUIT_BREAKER_SUCCESS: 'CIRCUIT_BREAKER_SUCCESS',
  CIRCUIT_BREAKER_RATE_LIMITING_ENFORCED: 'CIRCUIT_BREAKER_RATE_LIMITING_ENFORCED',

  CURRENT_RATE: 'CURRENT_RATE',
  CURRENT_RATE_LIMIT: 'CURRENT_RATE_LIMIT',

  DISPATCHING_ATTEMPTS: 'DISPATCHING_ATTEMPTS',
  DISPATCH_DURATION: 'DISPATCH_DURATION',
  DISPATCHED: 'DISPATCHED',

  DYNAMODB_CONSUMED_READ_CAPACITY_UNITS: 'DYNAMODB_CONSUMED_READ_CAPACITY_UNITS',
  DYNAMODB_CONSUMED_WRITE_CAPACITY_UNITS: 'DYNAMODB_CONSUMED_WRITE_CAPACITY_UNITS',

  MTLS_AUTH_REQUESTS_COUNT: 'MTLS_AUTH_REQUESTS_COUNT',
  MTLS_AUTH_REQUESTS_DENIED_COUNT: 'MTLS_AUTH_REQUESTS_DENIED_COUNT',
  MTLS_AUTH_REQUESTS_DENIED_UNKNOWN_CERTIFICATE_COUNT: 'MTLS_AUTH_REQUESTS_DENIED_UNKNOWN_CERTIFICATE_COUNT',
  MTLS_AUTH_REQUESTS_DENIED_REVOKED_CERTIFICATE_COUNT: 'MTLS_AUTH_REQUESTS_DENIED_REVOKED_CERTIFICATE_COUNT',
  MTLS_AUTH_REQUESTS_ALLOWED_COUNT: 'MTLS_AUTH_REQUESTS_ALLOWED_COUNT',

  PROCESSING_ATTEMPTS: 'PROCESSING_ATTEMPTS',
  PROCESSING_DURATION: 'PROCESSING_DURATION',
  PROCESSED: 'PROCESSED',

  QUEUE_MESSAGE_RETRY_ATTEMPT: 'QUEUE_MESSAGE_RETRY_ATTEMPT',

  QUEUE_ANALYTICS_PUBLISHED_SUCCESSFULLY: 'QUEUE_ANALYTICS_PUBLISHED_SUCCESSFULLY',
  QUEUE_ANALYTICS_PUBLISHED_FAILED: 'QUEUE_ANALYTICS_PUBLISHED_FAILED',
  QUEUE_DISPATCH_PUBLISHED_SUCCESSFULLY: 'QUEUE_DISPATCH_PUBLISHED_SUCCESSFULLY',
  QUEUE_DISPATCH_PUBLISHED_FAILED: 'QUEUE_DISPATCH_PUBLISHED_FAILED',
  QUEUE_PROCESSING_PUBLISHED_SUCCESSFULLY: 'QUEUE_PROCESSING_PUBLISHED_SUCCESSFULLY',
  QUEUE_PROCESSING_PUBLISHED_FAILED: 'QUEUE_PROCESSING_PUBLISHED_FAILED',

  RATE_LIMITING: 'RATE_LIMITING',
  RATE_LIMITING_ENFORCED: 'RATE_LIMITING_ENFORCED',
} as const;

// Coverts all metrics for analytics events into a metric that uses the units count
const addCountToMetric = <T extends object>(enumerator: T) => {
  return Object.fromEntries(Object.values(enumerator).map((value) => [`${value}`, MetricUnit.Count])) as {
    [K in (typeof MetricsLabels)[keyof typeof MetricsLabels] as K]: typeof MetricUnit.Count;
  };
};
const analyticsEventMetricCount = addCountToMetric(AnalyticsEventsLabels);

export const MetricsLabelsUnits = {
  ...analyticsEventMetricCount,

  [MetricsLabels.API_CALL_TRIGGERED]: MetricUnit.Count,

  [MetricsLabels.BATCH_ITEM_FAILURES_DISPATCH]: MetricUnit.Count,
  [MetricsLabels.BATCH_ITEM_FAILURES_PROCESSING]: MetricUnit.Count,
  [MetricsLabels.BATCH_ITEM_FAILURES_VALIDATION]: MetricUnit.Count,

  [MetricsLabels.CIRCUIT_BREAKER_CURRENT_RATE]: MetricUnit.Count,
  [MetricsLabels.CIRCUIT_BREAKER_CURRENT_RATE_LIMIT]: MetricUnit.Count,
  [MetricsLabels.CIRCUIT_BREAKER_FAILURE]: MetricUnit.Count,
  [MetricsLabels.CIRCUIT_BREAKER_STATE]: MetricUnit.NoUnit,
  [MetricsLabels.CIRCUIT_BREAKER_SUCCESS]: MetricUnit.Count,
  [MetricsLabels.CIRCUIT_BREAKER_RATE_LIMITING_ENFORCED]: MetricUnit.NoUnit,

  [MetricsLabels.CURRENT_RATE]: MetricUnit.Count,
  [MetricsLabels.CURRENT_RATE_LIMIT]: MetricUnit.Count,

  [MetricsLabels.DISPATCHING_ATTEMPTS]: MetricUnit.Count,
  [MetricsLabels.DISPATCH_DURATION]: MetricUnit.Milliseconds,
  [MetricsLabels.DISPATCHED]: MetricUnit.Count,

  [MetricsLabels.DYNAMODB_CONSUMED_READ_CAPACITY_UNITS]: MetricUnit.Count,
  [MetricsLabels.DYNAMODB_CONSUMED_WRITE_CAPACITY_UNITS]: MetricUnit.Count,

  [MetricsLabels.MTLS_AUTH_REQUESTS_COUNT]: MetricUnit.Count,
  [MetricsLabels.MTLS_AUTH_REQUESTS_DENIED_COUNT]: MetricUnit.Count,
  [MetricsLabels.MTLS_AUTH_REQUESTS_DENIED_UNKNOWN_CERTIFICATE_COUNT]: MetricUnit.Count,
  [MetricsLabels.MTLS_AUTH_REQUESTS_DENIED_REVOKED_CERTIFICATE_COUNT]: MetricUnit.Count,
  [MetricsLabels.MTLS_AUTH_REQUESTS_ALLOWED_COUNT]: MetricUnit.Count,

  [MetricsLabels.PROCESSING_ATTEMPTS]: MetricUnit.Count,
  [MetricsLabels.PROCESSING_DURATION]: MetricUnit.Milliseconds,
  [MetricsLabels.PROCESSED]: MetricUnit.Count,

  [MetricsLabels.QUEUE_MESSAGE_RETRY_ATTEMPT]: MetricUnit.Count,

  [MetricsLabels.QUEUE_ANALYTICS_PUBLISHED_SUCCESSFULLY]: MetricUnit.Count,
  [MetricsLabels.QUEUE_ANALYTICS_PUBLISHED_FAILED]: MetricUnit.Count,
  [MetricsLabels.QUEUE_DISPATCH_PUBLISHED_SUCCESSFULLY]: MetricUnit.Count,
  [MetricsLabels.QUEUE_DISPATCH_PUBLISHED_FAILED]: MetricUnit.Count,
  [MetricsLabels.QUEUE_PROCESSING_PUBLISHED_SUCCESSFULLY]: MetricUnit.Count,
  [MetricsLabels.QUEUE_PROCESSING_PUBLISHED_FAILED]: MetricUnit.Count,

  [MetricsLabels.RATE_LIMITING]: MetricUnit.Count,
  [MetricsLabels.RATE_LIMITING_ENFORCED]: MetricUnit.NoUnit,
} as const;

export type KnownMetrics = Omit<Metrics, 'addMetric'> & {
  addMetric: <Label extends keyof typeof MetricsLabels>(
    name: Label,
    unit: (typeof MetricsLabelsUnits)[Label],
    value: number
  ) => void;
};

export class ObservabilityService {
  constructor(
    public logger: Logger,
    public metrics: KnownMetrics,
    public tracer: Tracer
  ) {}
}
