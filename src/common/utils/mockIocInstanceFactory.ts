import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { EventsDynamoRepository, InboundDynamoRepository } from '@common/repositories';
import {
  ConfigurationService,
  ProcessingQueueService,
  AnalyticsQueueService,
  AnalyticsService,
  DispatchQueueService,
  CacheService,
  NotificationService,
} from '@common/services';
import { IServicesMock } from '@common/models/interfaces/IServicesMocks';
import { Mocked } from 'vitest';
import { Observability } from '@common/utils/observability';

// Observability mocks
export const observabilitySpies = (): Mocked<Observability> => {
  const loggerMock = new Logger() as Mocked<Logger>;
  const metricsMocks = new Metrics() as Mocked<Metrics>;
  const tracerMocks = new Tracer() as Mocked<Tracer>;

  const observabilityMock = new Observability(loggerMock, metricsMocks, tracerMocks) as Mocked<Observability>;

  return observabilityMock;
};

// Service and Repository Mocks
export const ServiceSpies = (observabilityMock: Mocked<Observability>): IServicesMock => {
  const configurationServiceMock = new ConfigurationService(observabilityMock) as Mocked<ConfigurationService>;
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
  const analyticsServiceMock = new AnalyticsService(
    observabilityMock,
    analyticsQueueServiceMock
  ) as Mocked<AnalyticsService>;
  const notificationServiceMock = new NotificationService(
    observabilityMock,
    configurationServiceMock
  ) as Mocked<NotificationService>;
  const inboundDynamoRepositoryMock = new InboundDynamoRepository(
    configurationServiceMock,
    observabilityMock
  ) as Mocked<InboundDynamoRepository>;
  const eventsDynamoRepositoryMock = new EventsDynamoRepository(
    configurationServiceMock,
    observabilityMock
  ) as Mocked<EventsDynamoRepository>;
  const cacheServiceMock = new CacheService(configurationServiceMock, observabilityMock) as Mocked<CacheService>;

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
  };
};
