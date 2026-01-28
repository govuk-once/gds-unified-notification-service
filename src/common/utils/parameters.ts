export const BoolParameters = {
  Config: {
    Common: {
      Enabled: 'config/common/enabled',
    },
  },
} as const;

export const StringParameters = {
  Api: {
    PostMessage: {
      ApiKey: 'api/postmessage/apikey',
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
      Key: 'table/events/key',
      Name: 'table/events/name',
    },
    Inbound: {
      Key: 'table/inbound/key',
      Name: 'table/inbound/name',
    },
  },
} as const;
