import { InboundDynamoRepository, EventsDynamoRepository } from '@common/repositories';
import {
  ConfigurationService,
  ProcessingQueueService,
  DispatchQueueService,
  AnalyticsQueueService,
  AnalyticsService,
  CacheService,
  NotificationService,
} from '@common/services';
import { Mocked } from 'vitest';

export interface IServicesMock {
  configurationServiceMock: Mocked<ConfigurationService>;
  processingQueueServiceMock: Mocked<ProcessingQueueService>;
  dispatchQueueServiceMock: Mocked<DispatchQueueService>;
  analyticsQueueServiceMock: Mocked<AnalyticsQueueService>;
  analyticsServiceMock: Mocked<AnalyticsService>;
  notificationServiceMock: Mocked<NotificationService>;
  inboundDynamoRepositoryMock: Mocked<InboundDynamoRepository>;
  eventsDynamoRepositoryMock: Mocked<EventsDynamoRepository>;
  cacheServiceMock: Mocked<CacheService>;
}
