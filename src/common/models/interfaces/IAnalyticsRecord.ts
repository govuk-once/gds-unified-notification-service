import { ValidationEnum } from '@common/models/ValidationEnum';

export interface IAnalyticsRecord {
  EventID: string;
  NotificationID: string;
  DepartmentID: string;
  APIGWExtendedID?: string;
  EventDateTime: string;
  Event: ValidationEnum;
  EventReason: string;
}
