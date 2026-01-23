import z from 'zod';

export const IAnalyticsSchema = z.object({
  NotificationID: z.string(),
  DepartmentID: z.string(),
  APIGWExtendedID: z.string(),
  EventDateTime: z.string(),
  Event: z.string().optional(),
  EventReason: z.string().optional(),
});

export const IAnalyticsArraySchema = z.array(z.object({ body: IAnalyticsSchema }));

export type IAnalytics = z.infer<typeof IAnalyticsSchema>;
export type IAnalyticsArray = z.infer<typeof IAnalyticsArraySchema>;
