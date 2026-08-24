import { ChannelsEnum } from '@common/models';
import z from 'zod';

export const IOrganisationConfigSchema = z.object({
  MessageRetention: z
    .object({
      Allowed: z.coerce.boolean(),
      Min: z.coerce.number().int().positive().min(1).optional(),
      Max: z.coerce.number().int().positive().min(1).optional(),
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
    })
    .optional(),
  Channels: z.enum(ChannelsEnum).array().optional(),
});
export type IOrganisationConfig = z.infer<typeof IOrganisationConfigSchema>;

export const IOrganisationRecordSchema = z.object({
  OrganisationID: z.string(),
  DisplayName: z.string(),
  OrganisationConfig: IOrganisationConfigSchema,
});
export type IOrganisationRecord = z.infer<typeof IOrganisationRecordSchema>;
