import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SQSClient } from '@aws-sdk/client-sqs';
import { SSMClient } from '@aws-sdk/client-ssm';
import { STSClient } from '@aws-sdk/client-sts';
import {
  CampaignsDynamoRepository,
  GroupStoreDynamoRepository,
  NotificationsDynamoRepository,
  OrganisationsDynamoRepository,
} from '@common/repositories';
import { MTLSRevocationDynamoRepository } from '@common/repositories/mtlsRevocationDynamoRepository';
import {
  AnalyticsExportService,
  AnalyticsQueueService,
  AnalyticsService,
  CacheService,
  CircuitBreakerService,
  ConfigurationService,
  ContentValidationService,
  DispatchQueueService,
  NotificationService,
  ObservabilityService,
  ProcessingQueueService,
} from '@common/services';
import { GroupProcessingQueueService } from '@common/services/groupProcessingQueueService';
import { ProcessingService } from '@common/services/processingService';
import { SMConfigurationService } from '@common/services/smConfigurationService';
import { SMNamespacedConfigurationService } from '@common/services/smNamespacedConfigurationService';
import { ValidationService } from '@common/services/validationService';
import { Mocked } from 'vitest';

// Observability mocks
/*
  Generates a mocked instance of the Observability class.
  Provides pre-spied Logger, Metrics, and Tracer dependencies for unit testing.
*/
export const observabilitySpies = (): Mocked<ObservabilityService> => {
  const loggerMock = new Logger() as Mocked<Logger>;
  const metricsMocks = new Metrics() as Mocked<Metrics>;
  const tracerMocks = new Tracer() as Mocked<Tracer>;

  const observabilityMock = new ObservabilityService(
    loggerMock,
    metricsMocks,
    tracerMocks
  ) as Mocked<ObservabilityService>;

  return observabilityMock;
};

// AWS client mocks
export interface AwsClientMocks {
  cloudWatchLogsClientMock: Mocked<CloudWatchLogsClient>;
  dynamoDBClientMock: Mocked<DynamoDB>;
  secretManagerClientMock: Mocked<SecretsManagerClient>;
  sqsClientMock: Mocked<SQSClient>;
  ssmClientMock: Mocked<SSMClient>;
  stsClientMock: Mocked<STSClient>;
}

/*
  Generates a mocked instance of AWS clients.
  Provides pre-spied AWS client for unit testing.
*/
export const awsClientSpies = (): AwsClientMocks => {
  const cloudWatchLogsClientMock = new CloudWatchLogsClient() as Mocked<CloudWatchLogsClient>;
  const dynamoDBClientMock = new DynamoDB() as Mocked<DynamoDB>;
  const secretManagerClientMock = new SecretsManagerClient() as Mocked<SecretsManagerClient>;
  const sqsClientMock = new SQSClient() as Mocked<SQSClient>;
  const ssmClientMock = new SSMClient() as Mocked<SSMClient>;
  const stsClientMock = new STSClient() as Mocked<STSClient>;

  return {
    cloudWatchLogsClientMock,
    dynamoDBClientMock,
    secretManagerClientMock,
    sqsClientMock,
    ssmClientMock,
    stsClientMock,
  };
};

// Service and Repository Mocks
/**
  Factory to initialize the mock service and repository layers.
  Organises the dependency injection of mocked services and repositories and ensuring they all share the same observability context.
*/
export const ServiceSpies = (observabilityMock: Mocked<ObservabilityService>, clientMocks: AwsClientMocks) => {
  // Config
  const configurationServiceMock = new ConfigurationService(
    clientMocks.ssmClientMock,
    observabilityMock
  ) as Mocked<ConfigurationService>;
  const smConfigurationServiceMock = new SMConfigurationService(
    clientMocks.secretManagerClientMock,
    observabilityMock
  ) as Mocked<SMConfigurationService>;
  const smNamespacedConfigurationServiceMock = new SMNamespacedConfigurationService(
    clientMocks.secretManagerClientMock,
    observabilityMock
  ) as Mocked<SMNamespacedConfigurationService>;

  // Queues
  const processingQueueServiceMock = new ProcessingQueueService(
    configurationServiceMock,
    clientMocks.sqsClientMock,
    observabilityMock
  ) as Mocked<ProcessingQueueService>;
  const groupProcessingQueueServiceMock = new GroupProcessingQueueService(
    configurationServiceMock,
    clientMocks.sqsClientMock,
    observabilityMock
  ) as Mocked<GroupProcessingQueueService>;
  const dispatchQueueServiceMock = new DispatchQueueService(
    configurationServiceMock,
    clientMocks.sqsClientMock,
    observabilityMock
  ) as Mocked<DispatchQueueService>;
  const analyticsQueueServiceMock = new AnalyticsQueueService(
    configurationServiceMock,
    clientMocks.sqsClientMock,
    observabilityMock
  ) as Mocked<AnalyticsQueueService>;

  // Dynamodb
  const notificationsDynamoRepositoryMock = new NotificationsDynamoRepository(
    configurationServiceMock,
    clientMocks.dynamoDBClientMock,
    observabilityMock
  ) as Mocked<NotificationsDynamoRepository>;
  const mtlsRevocationDynamoRepositoryMock = new MTLSRevocationDynamoRepository(
    configurationServiceMock,
    clientMocks.dynamoDBClientMock,
    observabilityMock
  ) as Mocked<MTLSRevocationDynamoRepository>;
  const campaignsDynamoRepositoryMock = new CampaignsDynamoRepository(
    configurationServiceMock,
    clientMocks.dynamoDBClientMock,
    observabilityMock
  ) as Mocked<CampaignsDynamoRepository>;
  const organisationsDynamoRepositoryMock = new OrganisationsDynamoRepository(
    configurationServiceMock,
    clientMocks.dynamoDBClientMock,
    observabilityMock
  ) as Mocked<OrganisationsDynamoRepository>;
  const groupStoreDynamoRepositoryMock = new GroupStoreDynamoRepository(
    configurationServiceMock,
    clientMocks.dynamoDBClientMock,
    observabilityMock
  );

  // Services
  const analyticsServiceMock = new AnalyticsService(
    observabilityMock,
    analyticsQueueServiceMock
  ) as Mocked<AnalyticsService>;
  const notificationServiceMock = new NotificationService(
    observabilityMock,
    configurationServiceMock,
    smNamespacedConfigurationServiceMock
  ) as Mocked<NotificationService>;
  const cacheServiceMock = new CacheService(configurationServiceMock, observabilityMock) as Mocked<CacheService>;
  const circuitBreakerServiceMock = new CircuitBreakerService(
    observabilityMock,
    configurationServiceMock,
    cacheServiceMock,
    'mock_platform'
  ) as Mocked<CircuitBreakerService>;
  const contentValidationServiceMock = new ContentValidationService(
    observabilityMock,
    configurationServiceMock,
    ['govuk:', 'https:'],
    ['*.gov.uk']
  ) as Mocked<ContentValidationService>;
  const processingServiceMock = new ProcessingService(
    observabilityMock,
    configurationServiceMock,
    smConfigurationServiceMock
  ) as Mocked<ProcessingService>;
  const analyticsExportServiceMock = new AnalyticsExportService(
    observabilityMock,
    configurationServiceMock,
    cacheServiceMock,
    clientMocks.cloudWatchLogsClientMock
  ) as Mocked<AnalyticsExportService>;
  const validationServiceMock = new ValidationService(contentValidationServiceMock, {
    channelControls: true,
    deeplinkUrl: true,
    messageRetention: true,
  });

  return {
    // Export
    // Queue
    processingQueueServiceMock,
    groupProcessingQueueServiceMock,
    dispatchQueueServiceMock,
    analyticsQueueServiceMock,
    // DynamoDB
    notificationsDynamoRepositoryMock,
    mtlsRevocationDynamoRepositoryMock,
    campaignsDynamoRepositoryMock,
    organisationsDynamoRepositoryMock,
    groupStoreDynamoRepositoryMock,
    // Services
    smConfigurationServiceMock,
    smNamespacedConfigurationServiceMock,
    configurationServiceMock,
    analyticsServiceMock,
    notificationServiceMock,
    cacheServiceMock,
    circuitBreakerServiceMock,
    contentValidationServiceMock,
    processingServiceMock,
    analyticsExportServiceMock,
    validationServiceMock,
  };
};
