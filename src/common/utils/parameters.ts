export const BoolParameters = {
  Config: {
    Common: {
      Enabled: 'config/common/enabled',
    },
  },
} as const;

export const StringParameters = {
  Table: {
    Events: {
      Name: 'table/events/name',
      Key: 'table/events/key',
    },
    IncomingMessage: {
      Name: 'table/events/name',
      Key: 'table/events/key',
    },
  },
  Queue: {
    Incoming: {
      Url: 'queue/incoming/url',
    },
    Processing: {
      Url: 'queue/processing/url',
    },
    Analytics: {
      Url: 'queue/analytics/url',
    },
  },
} as const;
