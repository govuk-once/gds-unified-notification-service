import { search } from '@aws-lambda-powertools/jmespath';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { CacheService, Configuration } from '@common/services';

// Observability
export const iocGetLogger = () => {
  return new Logger({
    serviceName: process.env.SERVICE_NAME ?? 'undefined',
    correlationIdSearchFn: search,
  });
};

export const iocGetTracer = () => new Tracer();

export const iocGetMetrics = () =>
  new Metrics({
    namespace: process.env.NAMESPACE_NAME ?? 'undefined',
    serviceName: process.env.SERVICE_NAME ?? 'undefined',
    defaultDimensions: {},
  });

// Services
export const iocGetConfigurationService = () => new Configuration();
export const iocGetCacheService = () => new CacheService(iocGetConfigurationService());
