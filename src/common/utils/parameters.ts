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
  },
  Config: {
    Cache: {
      Host: 'config/common/cache/host',
      Name: 'config/common/cache/name',
      User: 'config/common/cache/user',
    },
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
  },
  Dispatch: {
    OneSignal: {
      ApiKey: `config/dispatch/onesignal/apiKey`,
      AppId: `config/dispatch/onesignal/appId`,
    },
  },
} as const;

export const NumericParameters = {
  Config: {
    Dispatch: {
      NotificationsProviderRateLimitPerMinute: 'config/common/cache/notificationsProviderRateLimitPerMinute',
    },
  },
} as const;
