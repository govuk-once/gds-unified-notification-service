import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import * as z from 'zod';

const shape = (Object.keys(NotificationStateEnum) as (keyof typeof NotificationStateEnum)[]).reduce(
  (acc, key) => {
    acc[key] = z.number().optional();
    return acc;
  },
  {} as Record<keyof typeof NotificationStateEnum, z.ZodOptional<z.ZodNumber>>
);

export const ICampaignRecordSchema = z.object({
  CompositeID: z.string(),
  ...shape,
});

export type ICampaignRecord = z.infer<typeof ICampaignRecordSchema>;
