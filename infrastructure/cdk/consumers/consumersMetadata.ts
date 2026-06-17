export const orgMetadata = {
  DVLA: { DisplayName: 'DVLA' },
  UNS: { DisplayName: 'UNS' },
} as const;

export type orgNamesWithMetadata = keyof typeof orgMetadata;
