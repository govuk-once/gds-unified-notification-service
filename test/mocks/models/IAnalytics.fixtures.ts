import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { AnalyticsEventFromIMessage, AnalyticsLog } from '@common/services';
import { IAnalytics } from '@project/lambdas';

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

export const mockAnalyticsEvents = (): AnalyticsEventFromIMessage[] => [
  {
    NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
    DepartmentID: 'Dev',
    APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
    OrganisationID: 'ORD01',
  },
  {
    NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80g',
    DepartmentID: 'Dev',
    APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeg',
    OrganisationID: 'ORD01',
  },
];

export const mockAnalyticsWithCampaignEvents = (): AnalyticsEventFromIMessage[] => [
  {
    NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80h',
    DepartmentID: 'Dev',
    CampaignID: 'CAMP01',
    APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
    OrganisationID: 'ORD01',
  },
  {
    NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80i',
    DepartmentID: 'Dev',
    CampaignID: 'CAMP01',
    APIGWExtendedID: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeg',
    OrganisationID: 'ORD01',
  },
];

export const mockAnalyticsLog = (event: NotificationStateEnum): AnalyticsLog => ({
  EventID: '123',
  DepartmentID: 'DEP1',
  OrganisationID: 'ORG01',
  NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
  CampaignID: 'CAM_ID',
  EventStatus: event,
  EventTimestamp: '2026-01-22T00:00:01Z',
});
