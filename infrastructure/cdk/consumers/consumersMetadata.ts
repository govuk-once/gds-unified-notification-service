export const devOrgMetadata = {
  DVLA: {
    DisplayName: 'DVLA',
    OrganisationConfig: {
      MessageRetention: {
        Allowed: false,
      },
    },
  },
  UNS: {
    DisplayName: 'UNS',
    OrganisationConfig: {
      MessageRetention: {
        Allowed: true,
        Min: 2,
        Max: 30,
      },
    },
  },
  EventsAggregator: {
    DisplayName: 'Foreign Travel Advice',
    OrganisationConfig: {
      MessageRetention: {
        Allowed: false,
      },
    },
  },
} as const;

export const stgOrgMetadata = {
  DVLA: {
    DisplayName: 'DVLA',
    OrganisationConfig: {
      MessageRetention: {
        Allowed: false,
      },
    },
  },
  UNS: {
    DisplayName: 'UNS',
    OrganisationConfig: {
      MessageRetention: {
        Allowed: true,
        Min: 2,
        Max: 30,
      },
    },
  },
} as const;

export const prodOrgMetadata = {
  DVLA: {
    DisplayName: 'DVLA',
    OrganisationConfig: {},
  },
  UNS: {
    DisplayName: 'UNS',
    OrganisationConfig: {},
  },
} as const;

export const getConsumersMetadata = (env: string) => {
  switch (env) {
    case 'dev':
      return devOrgMetadata;

    case 'stg':
      return stgOrgMetadata;

    case 'prod':
      return prodOrgMetadata;

    default:
      return devOrgMetadata;
  }
};
