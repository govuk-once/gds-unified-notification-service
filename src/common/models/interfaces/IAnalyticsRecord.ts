import { ValidationEnum } from '@common/models/ValidationEnum';

export interface IAnalyticsRecord {
  NotificationID: string;
  DepartmentID: string;
  ApiGWExtendedID: string;
  EventDateTime: string;
  Event: ValidationEnum;
  EventReason: string;
}
