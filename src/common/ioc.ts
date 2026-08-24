import { search } from '@aws-lambda-powertools/jmespath';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SQSClient } from '@aws-sdk/client-sqs';
import { SSMClient } from '@aws-sdk/client-ssm';
import { ServiceMisconfigurationError } from '@common/models/Errors/InternalServerError';
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
  KnownMetrics,
  NotificationService,
  ObservabilityService,
  ProcessingQueueService,
  ProcessingService,
  SMConfigurationService,
  SMNamespacedConfigurationService,
} from '@common/services';
import { GroupProcessingQueueService } from '@common/services/groupProcessingQueueService';
import { ValidationService } from '@common/services/validationService';
import { InMemoryTTLCache, StringParameters } from '@common/utils';

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
      serviceCache[key] ??= fn() as object;
      return serviceCache[key] as Instance;
    }
    // Timebound singleton - same behaviour as singleton, however after TTL expires, subsequent requests trigger recreation
    // This is quite useful for config dependent classes as it allows config to be updates without constant refreshing
    if (mode == Mode.TIMEBOUND_SINGLETON) {
      if (!serviceCacheTTL.has(key)) {
        serviceCacheTTL.set(key, fn() as object);
      }
      return serviceCacheTTL.get(key) as Instance;
    }
    // New instance
    if (mode == Mode.NEW_INSTANCE) {
      return fn();
    }

    throw new ServiceMisconfigurationError(['Failed to resolve IOC, unexpected mode']);
  };
};

// Observability
export const iocGetLogger = ioc(
  'Logger',
  Mode.SINGLETON,
  () =>
    new Logger({
      serviceName: process.env.SERVICE_NAME ?? 'undefined',
      logLevel: (process.env.LOG_LEVEL ?? 'INFO') as
        undefined | 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT' | 'CRITICAL',
      correlationIdSearchFn: search,
      // Prevent accidental logging of message contents
      jsonReplacerFn: (key, value) => {
        if (
          [
            'NotificationTitle',
            'NotificationBody',
            'MessageTitle',
            'MessageBody',
            'clientCertPem',
            `x-amz-security-token`,
            `app_id`,
            `Authorization`,
            `x-api-key`,
            `apiKey`,
          ].includes(key)
        ) {
          return `******`;
        }
        return value;
      },
    })
);
export const iocGetTracer = ioc('Tracer', Mode.SINGLETON, () => new Tracer());
export const iocGetMetrics = ioc(
  'Metrics',
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
  'ObservabilityService',
  Mode.SINGLETON,
  () => new ObservabilityService(iocGetLogger(), iocGetMetrics() as KnownMetrics, iocGetTracer())
);

// AWS Clients
export const iocGetCloudWatchLogsClient = ioc('CloudWatchLogsClient', Mode.SINGLETON, () => new CloudWatchLogsClient());
export const iocGetDynamoClient = ioc('DynamoClient', Mode.SINGLETON, () => new DynamoDB());
export const iocGetSecretManagerClient = ioc('SecretManagerClient', Mode.SINGLETON, () => new SecretsManagerClient());
export const iocGetSQSClient = ioc('SQSClient', Mode.SINGLETON, () => new SQSClient());
export const iocGetSSMClient = ioc('SSMClient', Mode.SINGLETON, () => new SSMClient());

// Services - Config & Cache
export const iocGetConfigurationService = ioc(
  'ConfigurationService',
  Mode.SINGLETON,
  () => new ConfigurationService(iocGetSSMClient(), iocGetObservabilityService())
);

export const iocGetSMConfigurationService = ioc(
  'SMConfigurationService',
  Mode.SINGLETON,
  () => new SMConfigurationService(iocGetSecretManagerClient(), iocGetObservabilityService())
);

export const iocGetSMNamespacedConfigurationService = ioc(
  'SMPrefixedConfigurationService',
  Mode.SINGLETON,
  () => new SMNamespacedConfigurationService(iocGetSecretManagerClient(), iocGetObservabilityService())
);

export const iocGetCacheService = ioc(
  'CacheService',
  Mode.SINGLETON,
  () => new CacheService(iocGetConfigurationService(), iocGetObservabilityService())
);

// Services - Queue dispatches
export const iocGetProcessingQueueService = ioc(
  'ProcessingQueueService',
  Mode.TIMEBOUND_SINGLETON,
  async () =>
    await new ProcessingQueueService(
      iocGetConfigurationService(),
      iocGetSQSClient(),
      iocGetObservabilityService()
    ).initialize()
);

export const iocGetGroupProcessingQueueService = ioc(
  'GroupProcessingQueueService',
  Mode.TIMEBOUND_SINGLETON,
  async () =>
    await new GroupProcessingQueueService(
      iocGetConfigurationService(),
      iocGetSQSClient(),
      iocGetObservabilityService()
    ).initialize()
);

export const iocGetDispatchQueueService = ioc(
  'DispatchQueueService',
  Mode.TIMEBOUND_SINGLETON,
  async () =>
    await new DispatchQueueService(
      iocGetConfigurationService(),
      iocGetSQSClient(),
      iocGetObservabilityService()
    ).initialize()
);
export const iocGetAnalyticsQueueService = ioc(
  'AnalyticsQueueService',
  Mode.TIMEBOUND_SINGLETON,
  async () =>
    await new AnalyticsQueueService(
      iocGetConfigurationService(),
      iocGetSQSClient(),
      iocGetObservabilityService()
    ).initialize()
);

// Services - DynamoDB
export const iocGetNotificationDynamoRepository = ioc(
  'NotificationsDynamoRepository',
  Mode.TIMEBOUND_SINGLETON,
  async () =>
    await new NotificationsDynamoRepository(
      iocGetConfigurationService(),
      iocGetDynamoClient(),
      iocGetObservabilityService()
    ).initialize()
);

export const iocGetMTLSRevocationDynamoRepository = ioc(
  'MTLSRevocationDynamoRepository',
  Mode.TIMEBOUND_SINGLETON,
  async () =>
    await new MTLSRevocationDynamoRepository(
      iocGetConfigurationService(),
      iocGetDynamoClient(),
      iocGetObservabilityService()
    ).initialize()
);

export const iocGetCampaignsDynamoRepository = ioc(
  'CampaignsDynamoRepository',
  Mode.TIMEBOUND_SINGLETON,
  async () =>
    await new CampaignsDynamoRepository(
      iocGetConfigurationService(),
      iocGetDynamoClient(),
      iocGetObservabilityService()
    ).initialize()
);

export const iocGetOrganisationsDynamoRepository = ioc(
  'OrganisationsDynamoRepository',
  Mode.TIMEBOUND_SINGLETON,
  async () =>
    await new OrganisationsDynamoRepository(
      iocGetConfigurationService(),
      iocGetDynamoClient(),
      iocGetObservabilityService()
    ).initialize()
);

export const iocGetGroupStoreDynamoRepository = ioc(
  'GroupStoreDynamoRepository',
  Mode.TIMEBOUND_SINGLETON,
  async () =>
    await new GroupStoreDynamoRepository(
      iocGetConfigurationService(),
      iocGetDynamoClient(),
      iocGetObservabilityService()
    ).initialize()
);

// Services - API Integrations
export const iocGetNotificationService = ioc('NotificationService', Mode.TIMEBOUND_SINGLETON, async () =>
  new NotificationService(
    iocGetObservabilityService(),
    iocGetConfigurationService(),
    iocGetSMNamespacedConfigurationService()
  ).initialize()
);

export const iocGetProcessingService = ioc('ProcessingService', Mode.TIMEBOUND_SINGLETON, () =>
  new ProcessingService(
    iocGetObservabilityService(),
    iocGetConfigurationService(),
    iocGetSMConfigurationService()
  ).initialize()
);

// Services - Analytics wrappers
export const iocGetAnalyticsQueue = ioc(
  'AnalyticsQueueService',
  Mode.SINGLETON,
  async () =>
    await new AnalyticsQueueService(
      iocGetConfigurationService(),
      iocGetSQSClient(),
      iocGetObservabilityService()
    ).initialize()
);

export const iocGetAnalyticsExportService = ioc(
  'AnalyticsExportService',
  Mode.SINGLETON,
  async () =>
    await new AnalyticsExportService(
      iocGetObservabilityService(),
      iocGetConfigurationService(),
      iocGetCacheService(),
      iocGetCloudWatchLogsClient()
    ).initialize()
);

export const iocGetAnalyticsService = ioc(
  'AnalyticsService',
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
  'ContentValidationService',
  Mode.SINGLETON,
  async () =>
    new ContentValidationService(
      iocGetObservabilityService(),
      iocGetConfigurationService(),
      (await iocGetConfigurationService().getParameter(StringParameters.Content.Allowed.Protocols)).split(','),
      (await iocGetConfigurationService().getParameter(StringParameters.Content.Allowed.UrlHostnames)).split(',')
    )
);

export const iocGetValidationService = ioc(
  'ValidationService',
  Mode.SINGLETON,
  async () =>
    new ValidationService(await iocGetContentValidationService(), await iocGetConfigurationService().getFeatureFlags())
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
