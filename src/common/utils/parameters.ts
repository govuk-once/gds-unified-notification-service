export const BoolParameters = {
  Config: {
    Common: {
      Enabled: 'config/common/enabled',
    },
    Validation: {
      Enabled: 'config/validation/enabled',
    },
    Processing: {
      Enabled: 'config/processing/enabled',
    },
    Dispatch: {
      Enabled: 'config/dispatch/enabled',
    },
  },
} as const;

export const StringParameters = {
  Api: {
    PostMessage: {
      ApiKey: 'api/postMessage/apiKey',
    },
    Flex: {
      ApiKey: 'api/flex/apiKey',
    },
  },
  Config: {
    Cache: {
      Host: 'config/common/cache/host',
      Name: 'config/common/cache/name',
      User: 'config/common/cache/user',
    },
  },
  Content: {
    Allowed: {
      Protocols: 'content/allowed/protocols',
      UrlHostnames: 'content/allowed/urlHostnames',
    },
  },
  Notification: {
    DeeplinkTemplate: 'notification/deeplinkTemplate',
  },
  Queue: {
    Analytics: {
      Url: 'queue/analytics/url',
    },
    Dispatch: {
      Url: 'queue/dispatch/url',
    },
    Incoming: {
      Url: 'queue/incoming/url',
    },
    Processing: {
      Url: 'queue/processing/url',
    },
  },
  Table: {
    Events: {
      KeyAttributes: 'table/events/attributes',
      Name: 'table/events/name',
    },
    Inbound: {
      KeyAttributes: 'table/inbound/attributes',
      Name: 'table/inbound/name',
    },
    MTLSRevocation: {
      KeyAttributes: 'table/mtls/attributes',
      Name: 'table/mtls/name',
    },
  },
  Dispatch: {
    OneSignal: {
      ApiKey: `config/dispatch/onesignal/apiKey`,
      AppId: `config/dispatch/onesignal/appId`,
    },
  },
  Authorizers: {},
} as const;

export const NumericParameters = {
  Config: {
    Dispatch: {
      NotificationsProviderRateLimitPerMinute: 'config/common/cache/notificationsProviderRateLimitPerMinute',
    },
  },
  CircuitBreaker: {
    Threshold: 'config/dispatch/circuitBreaker/threshold',
    WindowDuration: 'config/dispatch/circuitBreaker/windowDuration',
    HalfOpenAfter: 'config/dispatch/circuitBreaker/halfOpenAfter',
    RateLimitWhenOpen: 'config/dispatch/circuitBreaker/rateLimitWhenOpen',
  },
} as const;

export const EnumParameters = {
  Config: {
    Dispatch: {
      Adapter: 'config/dispatch/adapter',
    },
  },
};
