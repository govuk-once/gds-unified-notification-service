import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import z from 'zod';

export const IAnalyticsSchema = z.object({
  EventID: z.string(),
  NotificationID: z.string(),
  DepartmentID: z.string(),
  APIGWExtendedID: z.string().optional(),
  EventDateTime: z.string(),
  Event: z.enum(NotificationStateEnum).optional().default(NotificationStateEnum.UNKNOWN),
  EventReason: z.string().optional(),
});

export type IAnalytics = z.infer<typeof IAnalyticsSchema>;
