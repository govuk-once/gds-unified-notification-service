export type SSMParameterType = 'boolean' | 'string' | 'numeric' | 'enum' | 'json';

export interface ParameterConfig<T extends SSMParameterType = SSMParameterType> {
  Path: string;
  Type: T;
  Default?: string;
}

type ParameterTree = {
  readonly [key: string]: ParameterConfig | ParameterTree;
};

const staticParam = <T extends SSMParameterType>(Path: string, Type: T, Default: string): ParameterConfig<T> => ({
  Path,
  Type,
  Default,
});
const infraParam = <T extends SSMParameterType>(Path: string, Type: T): ParameterConfig<T> => ({ Path, Type });

const SSMParameters = {
  Config: {
    Common: {
      Enabled: staticParam('config/common/enabled', 'boolean', 'true'),
      Cache: {
        Host: infraParam('config/common/cache/host', 'string'),
        Name: infraParam('config/common/cache/name', 'string'),
        User: infraParam('config/common/cache/user', 'string'),
        NotificationsProviderRateLimitPerMinute: staticParam(
          'config/common/cache/notificationsProviderRateLimitPerMinute',
          'numeric',
          '5'
        ),
      },
    },
    Validation: {
      Enabled: staticParam('config/validation/enabled', 'boolean', 'true'),
    },
    Processing: {
      Enabled: staticParam('config/processing/enabled', 'boolean', 'true'),
      Adapter: staticParam('config/processing/adapter', 'enum', 'VOID'),
    },
    GroupProcessingWorker: {
      Enabled: staticParam('config/groupProcessingWorker/enabled', 'boolean', 'true'),
    },
    Dispatch: {
      Enabled: staticParam('config/dispatch/enabled', 'boolean', 'true'),
      Adapter: staticParam('config/dispatch/adapter', 'enum', 'VOID'),
      OneSignal: {
        AppId: staticParam('config/dispatch/onesignal/appId', 'string', 'placeholder'),
      },
      CircuitBreaker: {
        Threshold: staticParam('config/dispatch/circuitBreaker/threshold', 'numeric', '5'),
        WindowDuration: staticParam('config/dispatch/circuitBreaker/windowDuration', 'numeric', '60'),
        HalfOpenAfter: staticParam('config/dispatch/circuitBreaker/halfOpenAfter', 'numeric', '30'),
        RateLimitWhenOpen: staticParam('config/dispatch/circuitBreaker/rateLimitWhenOpen', 'numeric', '5'),
      },
    },
    FeatureFlags: {
      ChannelControls: infraParam('config/featureFlag/channelControls', 'boolean'),
      DeepLinkUrl: infraParam('config/featureFlag/deeplinkUrl', 'boolean'),
      MessageRetention: infraParam('config/featureFlag/messageRetention', 'boolean'),
    },
    UDP: {
      SM: staticParam('udp/config/sm', 'string', 'null'),
      KMS: staticParam('udp/config/kms', 'string', 'null'),
      Role: staticParam('udp/config/role', 'string', 'null'),
    },
  },
  Api: {
    Flex: {
      ApiKey: staticParam('api/flex/apiKey', 'string', 'mockApiKey'),
    },
  },
  Alerts: {
    Slack: {
      WorkspaceId: staticParam('alerts/slack/workspaceId', 'string', 'null'),
      ChannelId: staticParam('alerts/slack/channelId', 'string', 'null'),
    },
  },
  Content: {
    Allowed: {
      Protocols: staticParam('content/allowed/protocols', 'string', 'govuk:,https:'),
      UrlHostnames: staticParam('content/allowed/urlHostnames', 'string', '*.gov.uk'),
    },
  },
  Notification: {
    DeeplinkTemplate: staticParam(
      'notification/deeplinkTemplate',
      'string',
      'govuk://app.gov.uk/notificationcentre/detail?id:{id}'
    ),
  },
  Group: {
    Dispatch: {
      WorkerCount: staticParam('group/dispatch/workerCount', 'numeric', '5'),
      WorkerBatchSize: staticParam('group/dispatch/workerBatchSize', 'numeric', '100'),
    },
  },
  Certificate: {
    Consumers: staticParam('certificate/consumers', 'string', '{}'),
  },
  Flex: {
    Account: staticParam('flex/account', 'string', 'null'),
    Vpce: staticParam('flex/vpce', 'string', 'null'),
  },
  AnalyticsExport: {
    LogGroup: {
      Name: infraParam('analytics/export/loggroup/name', 'string'),
    },
    Bucket: {
      Name: infraParam('analytics/export/bucket/name', 'string'),
    },
  },
  Queue: {
    Analytics: { Url: infraParam('queue/analytics/url', 'string') },
    Dispatch: { Url: infraParam('queue/dispatch/url', 'string') },
    GroupProcessing: { Url: infraParam('queue/groupprocessing/url', 'string') },
    Incoming: { Url: infraParam('queue/incoming/url', 'string') },
    Processing: { Url: infraParam('queue/processing/url', 'string') },
  },
  Table: {
    Inbound: { Attributes: infraParam('table/inbound/attributes', 'json') },
    MTLSRevocation: { Attributes: infraParam('table/mtls/attributes', 'json') },
    Campaigns: { Attributes: infraParam('table/campaigns/attributes', 'json') },
    Organisations: { Attributes: infraParam('table/organisations/attributes', 'json') },
    GroupStore: { Attributes: infraParam('table/groupstore/attributes', 'json') },
  },
} as const satisfies ParameterTree;

export default SSMParameters;

export function getParametersConfig<T>(obj: T): ParameterConfig[] {
  if (typeof obj !== 'object' || obj === null) {
    return [];
  }

  if ('Path' in obj && 'Type' in obj && 'Default' in obj) {
    return [obj as ParameterConfig];
  }

  return Object.values(obj).flatMap((value) => getParametersConfig(value));
}
