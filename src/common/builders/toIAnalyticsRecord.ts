import { IAnalyticsRecord } from '@common/models/interfaces/IAnalyticsRecord';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { IAnalytics } from '@project/lambdas/interfaces/IAnalyticsSchema';

export const toIAnalyticsRecord = (
  message: Partial<IAnalytics>,
  receivedDateTime: string
): IAnalyticsRecord | undefined => {
  return !message?.NotificationID
    ? undefined
    : {
        NotificationID: message?.NotificationID,
        DepartmentID: message?.DepartmentID || '',
        ApiGWExtendedID: message?.APIGWExtendedID || '',
        EventDateTime: receivedDateTime,
        Event: (message?.Event as ValidationEnum) || ValidationEnum.UNKNOWN,
        Message: message?.Message || '',
      };
};
