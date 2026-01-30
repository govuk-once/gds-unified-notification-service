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
import { IObservabilityMocks } from '@project/lambdas/interfaces/IObservabilityMocks';
import { IServicesMock } from '@project/lambdas/interfaces/IServicesMocks';
import { Mocked } from 'vitest';

// Observability mocks
export const injectObservabilityMocks = (): IObservabilityMocks => {
  const loggerMock = new Logger() as Mocked<Logger>;
  const metricsMock = new Metrics() as Mocked<Metrics>;
  const tracerMock = new Tracer() as Mocked<Tracer>;

  return { loggerMock: loggerMock, metricsMock: metricsMock, tracerMock: tracerMock };
};

// Service and Repository Mocks
export const injectServiceMocks = (observabilityMocks: IObservabilityMocks): IServicesMock => {
  const configurationServiceMock = new ConfigurationService(
    observabilityMocks.loggerMock,
    observabilityMocks.metricsMock,
    observabilityMocks.tracerMock
  ) as Mocked<ConfigurationService>;
  const processingQueueServiceMock = new ProcessingQueueService(
    configurationServiceMock,
    observabilityMocks.loggerMock,
    observabilityMocks.metricsMock,
    observabilityMocks.tracerMock
  ) as Mocked<ProcessingQueueService>;
  const dispatchQueueServiceMock = new DispatchQueueService(
    configurationServiceMock,
    observabilityMocks.loggerMock,
    observabilityMocks.metricsMock,
    observabilityMocks.tracerMock
  ) as Mocked<DispatchQueueService>;
  const analyticsQueueServiceMock = new AnalyticsQueueService(
    configurationServiceMock,
    observabilityMocks.loggerMock,
    observabilityMocks.metricsMock,
    observabilityMocks.tracerMock
  ) as Mocked<AnalyticsQueueService>;
  const analyticsServiceMock = new AnalyticsService(
    observabilityMocks.loggerMock,
    observabilityMocks.metricsMock,
    observabilityMocks.tracerMock,
    analyticsQueueServiceMock
  ) as Mocked<AnalyticsService>;
  const notificationServiceMock = new NotificationService(
    observabilityMocks.loggerMock,
    observabilityMocks.metricsMock,
    observabilityMocks.tracerMock,
    configurationServiceMock
  ) as Mocked<NotificationService>;
  const inboundDynamoRepositoryMock = new InboundDynamoRepository(
    configurationServiceMock,
    observabilityMocks.loggerMock,
    observabilityMocks.metricsMock,
    observabilityMocks.tracerMock
  ) as Mocked<InboundDynamoRepository>;
  const eventsDynamoRepositoryMock = new EventsDynamoRepository(
    configurationServiceMock,
    observabilityMocks.loggerMock,
    observabilityMocks.metricsMock,
    observabilityMocks.tracerMock
  ) as Mocked<EventsDynamoRepository>;
  const cacheServiceMock = new CacheService(
    configurationServiceMock,
    observabilityMocks.loggerMock
  ) as Mocked<CacheService>;

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
