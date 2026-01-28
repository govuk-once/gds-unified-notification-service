import { IAnalyticsRecord } from '@common/models/interfaces/IAnalyticsRecord';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { IAnalytics } from '@project/lambdas/interfaces/IAnalyticsSchema';

export const toIAnalyticsRecord = (message: IAnalytics): IAnalyticsRecord | undefined => {
  return {
    EventID: message.EventID,
    NotificationID: message.NotificationID,
    DepartmentID: message.DepartmentID,
    APIGWExtendedID: message.APIGWExtendedID,
    EventDateTime: message.EventDateTime,
    Event: (message?.Event as ValidationEnum) || ValidationEnum.UNKNOWN,
    EventReason: message?.EventReason || '',
  };
};
