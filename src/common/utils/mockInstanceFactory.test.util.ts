import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { EventsDynamoRepository, InboundDynamoRepository } from '@common/repositories';
import {
  AnalyticsQueueService,
  AnalyticsService,
  CacheService,
  ConfigurationService,
  ContentValidationService,
  DispatchQueueService,
  NotificationService,
  ObservabilityService,
  ProcessingQueueService,
} from '@common/services';
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

// Service and Repository Mocks
/**
  Factory to initialize the mock service and repository layers.
  Organises the dependency injection of mocked services and repositories and ensuring they all share the same observability context.
*/
export const ServiceSpies = (observabilityMock: Mocked<ObservabilityService>) => {
  // Config
  const configurationServiceMock = new ConfigurationService(observabilityMock) as Mocked<ConfigurationService>;

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
  const inboundDynamoRepositoryMock = new InboundDynamoRepository(
    configurationServiceMock,
    observabilityMock
  ) as Mocked<InboundDynamoRepository>;
  const eventsDynamoRepositoryMock = new EventsDynamoRepository(
    configurationServiceMock,
    observabilityMock
  ) as Mocked<EventsDynamoRepository>;

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
  const contentValidationServiceMock = new ContentValidationService(
    observabilityMock,
    configurationServiceMock
  ) as Mocked<ContentValidationService>;

  return {
    configurationServiceMock: configurationServiceMock,
    processingQueueServiceMock,
    dispatchQueueServiceMock,
    analyticsQueueServiceMock,
    analyticsServiceMock,
    notificationServiceMock,
    inboundDynamoRepositoryMock,
    eventsDynamoRepositoryMock,
    cacheServiceMock,
    contentValidationServiceMock,
  };
};
