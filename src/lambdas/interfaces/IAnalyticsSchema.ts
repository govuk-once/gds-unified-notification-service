import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import z from 'zod';

export const IAnalyticsSchema = z.object({
  EventID: z.string(),
  NotificationID: z.string(),
  CampaignID: z.string().optional(),
  DepartmentID: z.string().optional(),
  OrganisationID: z.string(),
  APIGWExtendedID: z.string().optional(),
  EventDateTime: z.string(),
  Event: z.enum(NotificationStateEnum).optional().default(NotificationStateEnum.UNKNOWN),
  EventReason: z.string().optional(),
});
export type IAnalytics = z.infer<typeof IAnalyticsSchema>;

/**
 * Test Fixtures
 */
export const mockIAnalytics = (event: NotificationStateEnum): IAnalytics => ({
  EventID: '123',
  DepartmentID: 'DEP1',
  OrganisationID: 'ORG01',
  NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
  CampaignID: 'CAM_ID',
  Event: event,
  EventDateTime: '2026-01-22T00:00:01Z',
  APIGWExtendedID: 'testExample',
  EventReason: 'testing',
});

export const mockFailedIAnalytics = (): IAnalytics =>
  ({
    DepartmentID: undefined,
    NotificationID: undefined,
    Event: NotificationStateEnum.READ,
    EventDateTime: '00000000',
    APIGWExtendedID: 'testExample',
    EventReason: 'testing',
  }) as unknown as IAnalytics;
