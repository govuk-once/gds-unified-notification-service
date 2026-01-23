import { search } from '@aws-lambda-powertools/jmespath';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { InboundDynamoRepository } from '@common/repositories/dynamodbRepository';
import {
  AnalyticsQueueService,
  CacheService,
  ConfigurationService,
  DispatchQueueService,
  ProcessingQueueService,
} from '@common/services';

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
export const iocGetConfigurationService = () =>
  new ConfigurationService(iocGetLogger(), iocGetMetrics(), iocGetTracer());
export const iocGetCacheService = () => new CacheService(iocGetConfigurationService());
export const iocGetProcessingQueueService = async () =>
  await new ProcessingQueueService(
    iocGetConfigurationService(),
    iocGetLogger(),
    iocGetMetrics(),
    iocGetTracer()
  ).initialize();
export const iocGetDispatchQueueService = async () =>
  await new DispatchQueueService(
    iocGetConfigurationService(),
    iocGetLogger(),
    iocGetMetrics(),
    iocGetTracer()
  ).initialize();
export const iocGetAnalyticsQueueService = async () =>
  await new AnalyticsQueueService(
    iocGetConfigurationService(),
    iocGetLogger(),
    iocGetMetrics(),
    iocGetTracer()
  ).initialize();
export const iocGetInboundDynamoRepository = async () =>
  await new InboundDynamoRepository(
    iocGetConfigurationService(),
    iocGetLogger(),
    iocGetMetrics(),
    iocGetTracer()
  ).initialize();
