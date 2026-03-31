import { search } from '@aws-lambda-powertools/jmespath';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { NotificationsDynamoRepository } from '@common/repositories';
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
import { InMemoryTTLCache } from '@common/utils';

enum Mode {
  SINGLETON,
  TIMEBOUND_SINGLETON,
  NEW_INSTANCE,
  CONTEXT,
}
const serviceCacheTTL = new InMemoryTTLCache<string, object>(60000);
const serviceCache = {} as Record<string, object>;
const ioc = <Instance>(key: string, mode: Mode, fn: () => Instance) => {
  return () => {
    // Create a single instance and always re-use it on subsequent requests
    if (mode == Mode.SINGLETON) {
      if (serviceCache[key] == undefined) {
        serviceCache[key] = fn() as object;
      }
      return serviceCache[key] as Instance;
    }
    // Timebound singleton - same behaviour as singleton, however after TTL expires, subsequent requests trigger recreation
    // This is quite useful for config dependent classes as it allows config to be updates without constant refreshing
    if (mode == Mode.TIMEBOUND_SINGLETON) {
      if (serviceCacheTTL.has(key) == false) {
        serviceCacheTTL.set(key, fn() as object);
      }
      return serviceCacheTTL.get(key) as Instance;
    }
    // New instance
    if (mode == Mode.NEW_INSTANCE) {
      return fn();
    }

    throw new Error('Failed to resolve IOC, unexpected mode');
  };
};

// Observability
export const iocGetLogger = ioc(
  `Logger`,
  Mode.SINGLETON,
  () =>
    new Logger({
      serviceName: process.env.SERVICE_NAME ?? 'undefined',
      correlationIdSearchFn: search,
      // Prevent accidental logging of message contents
      jsonReplacerFn: (key, value) => {
        if (['NotificationTitle', 'NotificationBody', 'MessageTitle', 'MessageBody', 'clientCertPem'].includes(key)) {
          return `******`;
        }
        return value;
      },
    })
);
export const iocGetTracer = ioc(`Tracer`, Mode.SINGLETON, () => new Tracer());
export const iocGetMetrics = ioc(
  `Metrics`,
  Mode.SINGLETON,
  () =>
    new Metrics({
      namespace: process.env.NAMESPACE_NAME ?? 'undefined',
      serviceName: process.env.SERVICE_NAME ?? 'undefined',
      defaultDimensions: {
        environment: process.env.PREFIX ?? 'undefined',
      },
    })
);

export const iocGetObservabilityService = ioc(
  `ObservabilityService`,
  Mode.SINGLETON,
  () => new ObservabilityService(iocGetLogger(), iocGetMetrics(), iocGetTracer())
);

// Services - Config & Cache
export const iocGetConfigurationService = ioc(
  `ConfigurationService`,
  Mode.SINGLETON,
  () => new ConfigurationService(iocGetObservabilityService())
);

export const iocGetCacheService = ioc(
  `CacheService`,
  Mode.SINGLETON,
  () => new CacheService(iocGetConfigurationService(), iocGetObservabilityService())
);

// Services - Queue dispatches
export const iocGetProcessingQueueService = ioc(
  `ProcessingQueueService`,
  Mode.TIMEBOUND_SINGLETON,
  async () => await new ProcessingQueueService(iocGetConfigurationService(), iocGetObservabilityService()).initialize()
);

export const iocGetDispatchQueueService = ioc(
  `DispatchQueueService`,
  Mode.TIMEBOUND_SINGLETON,
  async () => await new DispatchQueueService(iocGetConfigurationService(), iocGetObservabilityService()).initialize()
);
export const iocGetAnalyticsQueueService = ioc(
  `AnalyticsQueueService`,
  Mode.TIMEBOUND_SINGLETON,
  async () => await new AnalyticsQueueService(iocGetConfigurationService(), iocGetObservabilityService()).initialize()
);

// Services - DynamoDB
export const iocGetNotificationDynamoRepository = ioc(
  `NotificationsDynamoRepository`,
  Mode.TIMEBOUND_SINGLETON,
  async () =>
    await new NotificationsDynamoRepository(iocGetConfigurationService(), iocGetObservabilityService()).initialize()
);

export const iocGetMTLSRevocationDynamoRepository = ioc(
  `MTLSRevocationDynamoRepository`,
  Mode.TIMEBOUND_SINGLETON,
  async () =>
    await new MTLSRevocationDynamoRepository(iocGetConfigurationService(), iocGetObservabilityService()).initialize()
);

// Services - API Integrations
export const iocGetNotificationService = ioc(`NotificationService`, Mode.TIMEBOUND_SINGLETON, () =>
  new NotificationService(iocGetObservabilityService(), iocGetConfigurationService()).initialize()
);

// Services - Analytics wrappers
export const iocGetAnalyticsQueue = ioc(
  `AnalyticsQueueService`,
  Mode.SINGLETON,
  async () => await new AnalyticsQueueService(iocGetConfigurationService(), iocGetObservabilityService()).initialize()
);

export const iocGetAnalyticsService = ioc(
  `AnalyticsService`,
  Mode.SINGLETON,
  async () => new AnalyticsService(iocGetObservabilityService(), await iocGetAnalyticsQueue())
);

// Services - Circuit Breaker (one instance per platform)
export const iocGetCircuitBreakerService = (platform: string): Promise<CircuitBreakerService> =>
  ioc(
    `CircuitBreakerService:${platform}`,
    Mode.TIMEBOUND_SINGLETON,
    async () =>
      new CircuitBreakerService(
        iocGetObservabilityService(),
        iocGetConfigurationService(),
        await iocGetCacheService().connect(),
        platform
      )
  )();

// Services - Other
export const iocGetContentValidationService = ioc(
  `ContentValidationService`,
  Mode.SINGLETON,
  () => new ContentValidationService(iocGetObservabilityService(), iocGetConfigurationService())
);

// Utility FN simplifying integration of dependencies which depend on config within handler
export const initializeDependencies = async <ClassInstance extends object, ClassProperty extends keyof ClassInstance>(
  target: ClassInstance,
  dependencies?: (() => { [key in ClassProperty]?: Promise<(typeof target)[key]> })[]
) => {
  // No dependencies supplied
  if (dependencies == undefined) {
    return target;
  }
  for (const dependency of dependencies) {
    for (const [property, promise] of Object.entries(dependency()) as [
      keyof ClassInstance,
      Promise<ClassInstance[keyof ClassInstance]>,
    ][]) {
      target[property] = await promise;
    }
  }
  return target;
};

export type HandlerDependencies<ClassInstance extends object> = {
  [key in keyof ClassInstance]?: Promise<ClassInstance[key]>;
};
