import { iocGetLogger } from '@common/ioc';
import { IAnalyticsRecord } from '@common/models/interfaces/IAnalyticsRecord';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { IAnalytics } from '@project/lambdas/interfaces/IAnalyticsSchema';

export const toIAnalyticsRecord = (
  message: Partial<IAnalytics>,
  receivedDateTime: string
): IAnalyticsRecord | undefined => {
  if (!message?.NotificationID) {
    const logger = iocGetLogger();
    logger.error(`Invalid message data: ${JSON.stringify(message)}`);
    return undefined;
  }
  return {
    NotificationID: message?.NotificationID,
    DepartmentID: message?.DepartmentID || '',
    ApiGWExtendedID: message?.APIGWExtendedID || '',
    EventDateTime: receivedDateTime,
    Event: (message?.Event as ValidationEnum) || ValidationEnum.UNKNOWN,
    Message: message?.Message || '',
  };
};
