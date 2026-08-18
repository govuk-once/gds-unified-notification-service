import z from 'zod';

export const IOrganisationRecordSchema = z.object({
  OrganisationID: z.string(),
  DisplayName: z.string(),
  OrganisationConfig: z.object({}),
});

export type IOrganisationRecord = z.infer<typeof IOrganisationRecordSchema>;
