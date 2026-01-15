import { search } from '@aws-lambda-powertools/jmespath';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { IStoreMessageRepository } from '@common/repositories/interfaces/IStoreMessageRepository';
import { StoreMessageRepository } from '@common/repositories/storeMessageRepository';
import { CacheService, Configuration } from '@common/services';

let dynamoServiceInstance: IStoreMessageRepository | undefined;

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

export const iocGetDynamoService = (tableName: string): IStoreMessageRepository => {
  const client = new DynamoDB({
    region: 'eu-west-2',
  });

  const dynamoService = new StoreMessageRepository(client, tableName);

  if (dynamoService) {
    console.log('DynamoDB has been Initialised.');
  }

  dynamoServiceInstance = dynamoService;
  return dynamoServiceInstance;
};
