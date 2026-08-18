export const orgMetadata = {
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

export type orgNamesWithMetadata = keyof typeof orgMetadata;
