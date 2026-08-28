import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SQSClient } from '@aws-sdk/client-sqs';
import { SSMClient } from '@aws-sdk/client-ssm';
import { STSClient } from '@aws-sdk/client-sts';
import { CircuitBreakerStateEnum } from '@common/models';
import {
  CampaignsDynamoRepository,
  GroupStoreDynamoRepository,
  MTLSRevocationDynamoRepository,
  NotificationsDynamoRepository,
  OrganisationsDynamoRepository,
} from '@common/repositories';
import {
  AnalyticsExportService,
  AnalyticsQueueService,
  AnalyticsService,
  CacheService,
  CircuitBreakerService,
  ConfigurationService,
  ContentValidationService,
  DispatchQueueService,
  GroupProcessingQueueService,
  NotificationService,
  ObservabilityService,
  ProcessingQueueService,
  ProcessingService,
  SMConfigurationService,
  SMNamespacedConfigurationService,
  ValidationService,
} from '@common/services';
import {
  mockDefaultConfig,
  mockDefaultExternalSecrets,
  mockDefaultSecrets,
  mockGetParameterImplementation,
} from '@test/mocks/services/mockConfigurationImplementation.test.util';
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

/*
  Generates a mocked instance of AWS clients.
  Provides pre-spied AWS client for unit testing.
*/
export const awsClientSpies = () => {
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
export const ServiceSpies = async (
  observabilityMock: Mocked<ObservabilityService>,
  clientMocks: ReturnType<typeof awsClientSpies>
) => {
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

  configurationServiceMock.getParameter.mockImplementation(mockGetParameterImplementation(mockDefaultConfig()));
  smNamespacedConfigurationServiceMock.getParameter = vi
    .fn()
    .mockImplementation(mockGetParameterImplementation(mockDefaultSecrets()));
  smConfigurationServiceMock.getParameter = vi
    .fn()
    .mockImplementation(mockGetParameterImplementation(mockDefaultExternalSecrets()));

  // Queues
  const processingQueueServiceMock = (await ProcessingQueueService.create(
    configurationServiceMock,
    observabilityMock,
    clientMocks.sqsClientMock
  )) as Mocked<ProcessingQueueService>;
  const groupProcessingQueueServiceMock = (await GroupProcessingQueueService.create(
    configurationServiceMock,
    observabilityMock,
    clientMocks.sqsClientMock
  )) as Mocked<GroupProcessingQueueService>;
  const dispatchQueueServiceMock = (await DispatchQueueService.create(
    configurationServiceMock,
    observabilityMock,
    clientMocks.sqsClientMock
  )) as Mocked<DispatchQueueService>;
  const analyticsQueueServiceMock = (await AnalyticsQueueService.create(
    configurationServiceMock,
    observabilityMock,
    clientMocks.sqsClientMock
  )) as Mocked<AnalyticsQueueService>;

  // Dynamodb
  const notificationsDynamoRepositoryMock = (await NotificationsDynamoRepository.create(
    configurationServiceMock,
    observabilityMock,
    clientMocks.dynamoDBClientMock
  )) as Mocked<NotificationsDynamoRepository>;
  const mtlsRevocationDynamoRepositoryMock = (await MTLSRevocationDynamoRepository.create(
    configurationServiceMock,
    observabilityMock,
    clientMocks.dynamoDBClientMock
  )) as Mocked<MTLSRevocationDynamoRepository>;
  const campaignsDynamoRepositoryMock = (await CampaignsDynamoRepository.create(
    configurationServiceMock,
    observabilityMock,
    clientMocks.dynamoDBClientMock
  )) as Mocked<CampaignsDynamoRepository>;
  const organisationsDynamoRepositoryMock = (await OrganisationsDynamoRepository.create(
    configurationServiceMock,
    observabilityMock,
    clientMocks.dynamoDBClientMock
  )) as Mocked<OrganisationsDynamoRepository>;
  const groupStoreDynamoRepositoryMock = (await GroupStoreDynamoRepository.create(
    configurationServiceMock,
    observabilityMock,
    clientMocks.dynamoDBClientMock
  )) as Mocked<GroupStoreDynamoRepository>;

  // Services
  const analyticsServiceMock = new AnalyticsService(
    observabilityMock,
    analyticsQueueServiceMock
  ) as Mocked<AnalyticsService>;
  const notificationServiceMock = (await NotificationService.create(
    observabilityMock,
    configurationServiceMock,
    smNamespacedConfigurationServiceMock
  )) as Mocked<NotificationService>;
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
  const processingServiceMock = (await ProcessingService.create(
    observabilityMock,
    configurationServiceMock,
    smConfigurationServiceMock
  )) as Mocked<ProcessingService>;
  const analyticsExportServiceMock = (await AnalyticsExportService.create(
    observabilityMock,
    configurationServiceMock,
    cacheServiceMock,
    clientMocks.cloudWatchLogsClientMock
  )) as Mocked<AnalyticsExportService>;
  const validationServiceMock = new ValidationService(contentValidationServiceMock, {
    channelControls: true,
    deeplinkUrl: true,
    messageRetention: true,
  }) as Mocked<ValidationService>;

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

// Test Fixture
export const iocSpies = async () => {
  const observabilityMocks = observabilitySpies();
  const awsClientMocks = awsClientSpies();
  const serviceMocks = await ServiceSpies(observabilityMocks, awsClientMocks);

  return { observabilityMocks, awsClientMocks, serviceMocks };
};

export const mockServicesExpectedBehaviour = (serviceMocks: Awaited<ReturnType<typeof ServiceSpies>>) => {
  // Set parameter returns
  const resetMockParameterStore = mockDefaultConfig();
  serviceMocks.configurationServiceMock.getParameter.mockImplementation(
    mockGetParameterImplementation(resetMockParameterStore)
  );
  const resetMockSecrets = mockDefaultSecrets();
  serviceMocks.smNamespacedConfigurationServiceMock.getParameter = vi
    .fn()
    .mockImplementation(mockGetParameterImplementation(resetMockSecrets));
  const resetMockExternalSecrets = mockDefaultExternalSecrets();
  serviceMocks.smConfigurationServiceMock.getParameter = vi
    .fn()
    .mockImplementation(mockGetParameterImplementation(resetMockExternalSecrets));

  // Service functions
  serviceMocks.analyticsQueueServiceMock.publishMessage = vi.fn().mockResolvedValue(undefined);
  serviceMocks.analyticsQueueServiceMock.publishMessageBatch = vi.fn().mockResolvedValue(undefined);
  serviceMocks.dispatchQueueServiceMock.publishMessage = vi.fn().mockResolvedValue(undefined);
  serviceMocks.dispatchQueueServiceMock.publishMessageBatch = vi.fn().mockResolvedValue(undefined);
  serviceMocks.groupProcessingQueueServiceMock.publishMessage = vi.fn().mockResolvedValue(undefined);
  serviceMocks.groupProcessingQueueServiceMock.publishMessageBatch = vi.fn().mockResolvedValue(undefined);
  serviceMocks.processingQueueServiceMock.publishMessage = vi.fn().mockResolvedValue(undefined);
  serviceMocks.processingQueueServiceMock.publishMessageBatch = vi.fn().mockResolvedValue(undefined);

  serviceMocks.analyticsExportServiceMock.logAnalytics = vi.fn().mockResolvedValue(undefined);
  serviceMocks.analyticsExportServiceMock.logStreamToS3Bucket = vi.fn().mockResolvedValue(undefined);
  serviceMocks.analyticsServiceMock.publishEvent = vi.fn().mockResolvedValue(undefined);
  serviceMocks.analyticsServiceMock.publishMultipleEvents = vi.fn().mockResolvedValue(undefined);

  serviceMocks.cacheServiceMock.store = vi.fn().mockResolvedValue(undefined);
  serviceMocks.cacheServiceMock.increment = vi.fn().mockResolvedValue(1);
  serviceMocks.cacheServiceMock.rateLimit = vi.fn().mockResolvedValue({ exceeded: false, capacityRemaining: 10 });
  serviceMocks.circuitBreakerServiceMock.checkCircuit = vi.fn().mockResolvedValue(undefined);
  serviceMocks.circuitBreakerServiceMock.recordSuccess = vi.fn().mockResolvedValue(undefined);
  serviceMocks.circuitBreakerServiceMock.recordFailure = vi.fn().mockResolvedValue(undefined);
  serviceMocks.circuitBreakerServiceMock.getState = vi.fn().mockResolvedValue(CircuitBreakerStateEnum.CLOSED);

  // Repository functions
  serviceMocks.campaignsDynamoRepositoryMock.incrementCampaigns = vi.fn().mockResolvedValue(undefined);
  serviceMocks.groupStoreDynamoRepositoryMock.getUsersGroups = vi.fn().mockResolvedValue([]);
  serviceMocks.groupStoreDynamoRepositoryMock.leaveGroups = vi.fn().mockResolvedValue([]);
  serviceMocks.groupStoreDynamoRepositoryMock.joinGroups = vi.fn().mockResolvedValue([]);
  serviceMocks.notificationsDynamoRepositoryMock.createRecord = vi.fn().mockResolvedValue(undefined);
  serviceMocks.notificationsDynamoRepositoryMock.updateRecord = vi.fn().mockResolvedValue(undefined);
  serviceMocks.notificationsDynamoRepositoryMock.createRecordBatch = vi.fn().mockResolvedValue(undefined);
  serviceMocks.notificationsDynamoRepositoryMock.addEvent = vi.fn().mockResolvedValue(undefined);
  serviceMocks.notificationsDynamoRepositoryMock.deleteRecord = vi.fn().mockResolvedValue(undefined);

  return { resetMockParameterStore, resetMockSecrets };
};

export const mockAWSClientsExpectedBehaviour = (clientMocks: ReturnType<typeof awsClientSpies>) => {
  clientMocks.sqsClientMock.send = vi.fn().mockResolvedValue(undefined);
  clientMocks.dynamoDBClientMock.putItem = vi.fn().mockResolvedValue({
    ConsumedCapacity: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1,
    },
  });
};
