import { ChannelsEnum } from '@common/models';
import z from 'zod';

export const IOrganisationConfigSchema = z.object({
  MessageRetention: z
    .object({
      Allowed: z.union([z.string(), z.number(), z.boolean()]).pipe(z.coerce.boolean()).pipe(z.literal(false)),
    })
    .or(
      z.object({
        Allowed: z.union([z.string(), z.number(), z.boolean()]).pipe(z.coerce.boolean()).pipe(z.literal(true)),
        Min: z.coerce.number().int().positive().min(1),
        Max: z.coerce.number().int().positive().min(1),
      })
    )
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
