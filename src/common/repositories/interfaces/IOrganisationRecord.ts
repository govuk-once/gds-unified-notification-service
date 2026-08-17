import z from 'zod';

export const IOrganisationRecordSchema = z.object({
  OrganisationID: z.string(),
  DisplayName: z.string(),
  OrganisationConfig: z.object({
    MessageRetention: z
      .object({
        Allowed: z.boolean(),
        Min: z.int().positive().optional(),
        Max: z.int().positive().optional(),
      })
      .superRefine((data, ctx) => {
        if (data.Allowed) {
          if (data.Min === undefined) {
            ctx.addIssue({
              code: 'custom',
              message: 'Min message retention for organisation is required when message retention is allowed',
              path: ['Min'],
            });
          }
          if (data.Max === undefined) {
            ctx.addIssue({
              code: 'custom',
              message: 'Max message retention for organisation is required when message retention is allowed',
              path: ['Max'],
            });
          }
          if (data.Min !== undefined && data.Max !== undefined && data.Min > data.Max) {
            ctx.addIssue({
              code: 'custom',
              message: 'Min message retention must be less than or equal to Max message retention for organisation',
              path: ['Max'],
            });
          }
        }
      }),
  }),
});

export type IOrganisationRecord = z.infer<typeof IOrganisationRecordSchema>;
