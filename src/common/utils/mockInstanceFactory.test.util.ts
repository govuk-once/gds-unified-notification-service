import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import {
  CampaignsDynamoRepository,
  NotificationsDynamoRepository,
  OrganisationsDynamoRepository,
} from '@common/repositories';
import { MTLSRevocationDynamoRepository } from '@common/repositories/mtlsRevocationDynamoRepository';
import {
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
import { ProcessingService } from '@common/services/processingService';
import { SMConfigurationService } from '@common/services/smConfigurationService';
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

// TODO: Add to test files when refactoring in NOT-292
// AWS client mocks
export interface AwsClientMocks {
  cloudWatchLogsClientMock: Mocked<CloudWatchLogsClient>
}

/*
  Generates a mocked instance of AWS clients.
  Provides pre-spied AWS client for unit testing.
*/
export const awsClientSpies = (): AwsClientMocks => {
  const cloudWatchLogsClientMock = new CloudWatchLogsClient() as Mocked<CloudWatchLogsClient>;

  return {
    cloudWatchLogsClientMock
  };
};

// Service and Repository Mocks
/**
  Factory to initialize the mock service and repository layers.
  Organises the dependency injection of mocked services and repositories and ensuring they all share the same observability context.
*/
export const ServiceSpies = (observabilityMock: Mocked<ObservabilityService>) => {
  // Config
  const configurationServiceMock = new ConfigurationService(observabilityMock) as Mocked<ConfigurationService>;
  const smConfigurationServiceMock = new SMConfigurationService(observabilityMock) as Mocked<SMConfigurationService>;

  // Queues
  const processingQueueServiceMock = new ProcessingQueueService(
    configurationServiceMock,
    observabilityMock
  ) as Mocked<ProcessingQueueService>;
  const dispatchQueueServiceMock = new DispatchQueueService(
    configurationServiceMock,
    observabilityMock
  ) as Mocked<DispatchQueueService>;
  const analyticsQueueServiceMock = new AnalyticsQueueService(
    configurationServiceMock,
    observabilityMock
  ) as Mocked<AnalyticsQueueService>;

  // Dynamodb
  const notificationsDynamoRepositoryMock = new NotificationsDynamoRepository(
    configurationServiceMock,
    observabilityMock
  ) as Mocked<NotificationsDynamoRepository>;
  const mtlsRevocationDynamoRepositoryMock = new MTLSRevocationDynamoRepository(
    configurationServiceMock,
    observabilityMock
  ) as Mocked<MTLSRevocationDynamoRepository>;
  const campaignsDynamoRepositoryMock = new CampaignsDynamoRepository(
    configurationServiceMock,
    observabilityMock
  ) as Mocked<CampaignsDynamoRepository>;
  const organisationsDynamoRepositoryMock = new OrganisationsDynamoRepository(
    configurationServiceMock,
    observabilityMock
  ) as Mocked<OrganisationsDynamoRepository>;

  // Services
  const analyticsServiceMock = new AnalyticsService(
    observabilityMock,
    analyticsQueueServiceMock
  ) as Mocked<AnalyticsService>;
  const notificationServiceMock = new NotificationService(
    observabilityMock,
    configurationServiceMock
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
    configurationServiceMock
  ) as Mocked<ContentValidationService>;
  const processingServiceMock = new ProcessingService(
    observabilityMock,
    configurationServiceMock,
    smConfigurationServiceMock
  ) as Mocked<ProcessingService>;
  // TODO: Add when refactoring in NOT-292
  // const analyticsExportServiceMock = new AnalyticsExportService(
  //   observabilityMock,
  //   configurationServiceMock,
  //   cacheServiceMock,
  // ) as Mocked<AnalyticsExportService>;

  return {
    // Queue
    processingQueueServiceMock,
    dispatchQueueServiceMock,
    analyticsQueueServiceMock,
    // DynamoDB
    notificationsDynamoRepositoryMock,
    mtlsRevocationDynamoRepositoryMock,
    campaignsDynamoRepositoryMock,
    organisationsDynamoRepositoryMock,
    // Services
    smConfigurationServiceMock,
    configurationServiceMock: configurationServiceMock,
    analyticsServiceMock,
    notificationServiceMock,
    cacheServiceMock,
    circuitBreakerServiceMock,
    contentValidationServiceMock,
    processingServiceMock,
  };
};
