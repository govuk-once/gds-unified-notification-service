import { search } from '@aws-lambda-powertools/jmespath';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { IDynamoDbService } from '@common/services/interfaces/IDynamoDbService';
import { DyanmoDBService } from './services/dynamoDbService';
import { QueueService } from '@common/services/queueService';
import { Configuration } from '@common/services/configuration';

// Services
export const iocGetDynamoService = (): IDynamoDbService => {
  const client = new DynamoDBClient({
    region: 'eu-west-2',
  });

  const tableName = 'AlphaTable';
  const dynamoService = new DyanmoDBService(client, tableName);

  return dynamoService;
};

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
export const iocGetQueueService = (QueueUrl: string) => new QueueService(QueueUrl);
