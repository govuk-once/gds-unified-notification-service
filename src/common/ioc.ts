import { search } from '@aws-lambda-powertools/jmespath';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { EventsDynamoRepository, InboundDynamoRepository } from '@common/repositories';
import {
  AnalyticsQueueService,
  AnalyticsService,
  CacheService,
  ConfigurationService,
  DispatchQueueService,
  NotificationService,
  ProcessingQueueService,
} from '@common/services';

// Observability
export const iocGetLogger = () => {
  return new Logger({
    serviceName: process.env.SERVICE_NAME ?? 'undefined',
    correlationIdSearchFn: search,
    // Prevent accidental logging of message contents
    jsonReplacerFn: (key, value) => {
      if (['NotificationTitle', 'NotificationBody', 'MessageTitle', 'MessageBody'].includes(key)) {
        return `******`;
      }
      return value;
    },
  });
};

export const iocGetTracer = () => new Tracer();

// Single instance of metrics is needed to be maintained across lambda lifetime to publish metrics accurately
const metrics = new Metrics({
  namespace: process.env.NAMESPACE_NAME ?? 'undefined',
  serviceName: process.env.SERVICE_NAME ?? 'undefined',
  defaultDimensions: {
    environment: process.env.PREFIX ?? 'undefined',
  },
});
export const iocGetMetrics = () => metrics;

// Services
export const iocGetConfigurationService = () =>
  new ConfigurationService(iocGetLogger(), iocGetMetrics(), iocGetTracer());

export const iocGetCacheService = () => new CacheService(iocGetConfigurationService(), iocGetLogger());
export const iocGetProcessingQueueService = async () =>
  await new ProcessingQueueService(
    iocGetConfigurationService(),
    iocGetLogger(),
    iocGetMetrics(),
    iocGetTracer()
  ).initialize();
export const iocGetDispatchQueueService = async () =>
  await new DispatchQueueService(
    iocGetConfigurationService(),
    iocGetLogger(),
    iocGetMetrics(),
    iocGetTracer()
  ).initialize();
export const iocGetAnalyticsQueueService = async () =>
  await new AnalyticsQueueService(
    iocGetConfigurationService(),
    iocGetLogger(),
    iocGetMetrics(),
    iocGetTracer()
  ).initialize();
export const iocGetInboundDynamoRepository = async () =>
  await new InboundDynamoRepository(
    iocGetConfigurationService(),
    iocGetLogger(),
    iocGetMetrics(),
    iocGetTracer()
  ).initialize();
export const iocGetEventsDynamoRepository = async () =>
  await new EventsDynamoRepository(
    iocGetConfigurationService(),
    iocGetLogger(),
    iocGetMetrics(),
    iocGetTracer()
  ).initialize();

export const iocGetNotificationService = () =>
  new NotificationService(iocGetLogger(), iocGetMetrics(), iocGetTracer(), iocGetConfigurationService()).initialize();

export const iocGetAnalyticsQueue = async () => {
  return await new AnalyticsQueueService(
    iocGetConfigurationService(),
    iocGetLogger(),
    iocGetMetrics(),
    iocGetTracer()
  ).initialize();
};

export const iocGetAnalyticsService = async () => {
  return new AnalyticsService(iocGetLogger(), iocGetMetrics(), iocGetTracer(), await iocGetAnalyticsQueue());
};

export const initializeDependencies = async <ClassInstance extends object, ClassProperty extends keyof ClassInstance>(
  target: ClassInstance,
  dependencies?: () => { [key in ClassProperty]?: Promise<(typeof target)[key]> }
) => {
  // No dependencies supplied
  if (dependencies == undefined) {
    return target;
  }

  for (const [property, promise] of Object.entries(dependencies()) as [
    keyof ClassInstance,
    Promise<ClassInstance[keyof ClassInstance]>,
  ][]) {
    target[property] = await promise;
  }
  return target;
};

export type HandlerDependencies<ClassInstance extends object> = {
  [key in keyof ClassInstance]?: Promise<ClassInstance[key]>;
};
