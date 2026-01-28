import z from 'zod';

export const IAnalyticsSchema = z.object({
  EventID: z.string(),
  NotificationID: z.string(),
  DepartmentID: z.string(),
  APIGWExtendedID: z.string().optional(),
  EventDateTime: z.string(),
  Event: z.string().optional(),
  EventReason: z.string().optional(),
});

export type IAnalytics = z.infer<typeof IAnalyticsSchema>;
