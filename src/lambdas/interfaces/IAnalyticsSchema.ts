import { ValidationEnum } from '@common/models/ValidationEnum';
import z from 'zod';

export const IAnalyticsSchema = z.object({
  EventID: z.string(),
  NotificationID: z.string(),
  DepartmentID: z.string(),
  APIGWExtendedID: z.string().optional(),
  EventDateTime: z.string(),
  Event: z.string().optional().default(ValidationEnum.UNKNOWN),
  EventReason: z.string().optional(),
});

export type IAnalytics = z.infer<typeof IAnalyticsSchema>;
