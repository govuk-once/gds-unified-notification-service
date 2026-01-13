import { search } from '@aws-lambda-powertools/jmespath';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { IDynamoDbService } from '@common/services/interfaces/IDynamoDbService';
import { DyanmoDbService } from './services/dynamoDbService';

let dynamoServiceInstance: IDynamoDbService | undefined;

// Services
export const iocGetDynamoService = (): IDynamoDbService => {
  const client = new DynamoDBClient({
    region: 'eu-west-2',
  });

  //Below table name for testing purposes only
  const tableName = 'gdsuns-ryan-8661-events';
  const dynamoService = new DyanmoDbService(client, tableName);

  if (dynamoService) {
    console.log('DynamoDB has been Initialised.');
  }

  dynamoServiceInstance = dynamoService;
  return dynamoServiceInstance;
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
