export const orgMetadata = {
  DVLA: { DisplayName: 'DVLA', OrganisationConfig: {} },
  UNS: { DisplayName: 'UNS', OrganisationConfig: {} },
} as const;

export type orgNamesWithMetadata = keyof typeof orgMetadata;
