import z from 'zod';

export const IGroupStoreRecordSchema = z.object({
  // IDs
  GroupID: z.string(),
  PushID: z.string(),
  CompositeID: z.string(),

  // Timestamp
  Date: z.string(),

  // Group Identifier
  Namespace: z.string(),
  Group: z.string(),
  Subgroup: z.string().optional(),
});

export type IGroupStoreRecord = z.infer<typeof IGroupStoreRecordSchema>;
