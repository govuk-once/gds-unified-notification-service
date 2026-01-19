import { search } from '@aws-lambda-powertools/jmespath';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { IStoreMessageRepository } from '@common/repositories/interfaces/IStoreMessageRepository';
import { StoreMessageRepository } from '@common/repositories/storeMessageRepository';
import { CacheService, Configuration, QueueService } from '@common/services';

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
export const iocGetConfigurationService = () => new Configuration(iocGetLogger(), iocGetMetrics(), iocGetTracer());
export const iocGetQueueService = (queueUrl: string) =>
  new QueueService(queueUrl, iocGetLogger(), iocGetMetrics(), iocGetTracer());
export const iocGetCacheService = () => new CacheService(iocGetConfigurationService());

export const iocGetDynamoRepository = (tableName: string): IStoreMessageRepository =>
  new StoreMessageRepository(tableName);
