import { Logger } from '@aws-lambda-powertools/logger';
import { IAnalyticsRecord } from '@common/models/interfaces/IAnalyticsRecord';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { IAnalytics } from '@project/lambdas/interfaces/IAnalyticsSchema';

export const toIAnalyticsRecord = (
  message: Partial<IAnalytics>,
  awsRequestId: string,
  receivedDateTime: string,
  logger: Logger
): IAnalyticsRecord | undefined => {
  if (!message?.NotificationID || !message?.DepartmentID) {
    logger.error(`Invalid message data: ${JSON.stringify(message)}`);
    return undefined;
  }
  return {
    NotificationID: message.NotificationID,
    DepartmentID: message.DepartmentID,
    ApiGWExtendedID: awsRequestId,
    EventDateTime: receivedDateTime,
    Event: (message?.Event as ValidationEnum) || ValidationEnum.UNKNOWN,
    EventReason: message?.EventReason || '',
  };
};
