import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Mocked } from 'vitest';

export interface IObservabilityMocks {
  loggerMock: Mocked<Logger>;
  metricsMock: Mocked<Metrics>;
  tracerMock: Mocked<Tracer>;
}
