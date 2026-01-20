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
    Inbound: {
      Name: 'table/inbound/name',
      Key: 'table/inbound/key',
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
} as const;
