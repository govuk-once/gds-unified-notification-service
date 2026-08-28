import { ChannelsEnum } from '@common/models';
import z from 'zod';

export const IOrganisationConfigSchema = z.object({
  MessageRetention: z
    .object({
      Allowed: z.transform((value) => {
        if (value == true || value === 'true') {
          return true;
        } else if (value == false || value == undefined || value === 'false') {
          return false;
        } else {
          console.log({ value });
          throw new Error("The string must be 'true' or 'false'");
        }
      }),
      Min: z.coerce.number().int().positive().min(1).optional(),
      Max: z.coerce.number().int().positive().min(1).optional(),
    })
    .superRefine((data, ctx) => {
      console.log({ data });
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

  DeeplinkAllowList: z
    .object({
      protocol: z.string(),
      hostname: z.string().optional(),
    })
    .or(
      z.object({
        protocol: z.string().optional(),
        hostname: z.string(),
      })
    )
    .array()
    .optional(),
});
export type IOrganisationConfig = z.infer<typeof IOrganisationConfigSchema>;

export const IOrganisationRecordSchema = z.object({
  OrganisationID: z.string(),
  DisplayName: z.string(),
  OrganisationConfig: IOrganisationConfigSchema,
});
export type IOrganisationRecord = z.infer<typeof IOrganisationRecordSchema>;
