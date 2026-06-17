import z from 'zod';

export const IOrganisationRecordSchema = z.object({
  OrganisationID: z.string(),
  DisplayName: z.string(),
});

export type IOrganisationRecord = z.infer<typeof IOrganisationRecordSchema>;
