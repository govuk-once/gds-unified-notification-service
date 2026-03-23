import {
  APIHandler,
  defineContract,
  HandlerDependencies,
  IAPIContractEvent,
  IAPIContractResponse,
  iocGetConfigurationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
} from '@common';
import { NotificationsDynamoRepository } from '@common/repositories';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { GetNotificationsQueryParams, GetNotificationsResponse } from '@generated/flex';
import { IMessageRecordToIFlexNotification } from '@project/lambdas/interfaces/IFlexNotification';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import type { Context } from 'aws-lambda';
import httpErrors from 'http-errors';
import z from 'zod';

/* Lambda Request Example
{
  "requestContext": {
    "requestId": "c6af9ac6-7b61-11e6-9a41-93e8deadbeef",
    "requestTimeEpoch": 1428582896000
  },
  "queryStringParameters": {
    "ExternalUserID": "user-ABC"
  }  
}
*/

const contract = defineContract({
  requestBodySchema: z.object(),
  requestPathParametersSchema: z.object(),
  requestQueryParametersSchema: GetNotificationsQueryParams,
  responseBodySchema: GetNotificationsResponse,
});

export class GetNotifications extends APIHandler<typeof contract> {
  // API Definition
  public operationId: string = 'getNotifications';
  public contract = contract;

  // Services & Repositories
  public notificationsDynamoRepository: NotificationsDynamoRepository;

  // Constructor
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<GetNotifications>
  ) {
    super(observability);
    this.injectDependencies(asyncDependencies);
  }

  // Handler logic
  public async implementation(
    event: IAPIContractEvent<typeof contract>,
    context: Context
  ): Promise<IAPIContractResponse<typeof contract>> {
    // Extract details
    const externalUserID = event.queryStringParameters?.externalUserID;

    // Handle missing query param
    if (!externalUserID) {
      throw new httpErrors.BadRequest();
    }

    const notifications = await this.notificationsDynamoRepository.getRecords<IMessageRecord>({
      field: 'ExternalUserID',
      value: externalUserID,
    });

    return {
      body: notifications
        .filter((notification) => {
          // Handle notifications that are past TTL expiration - DynamoDB can take up to 48h to remove these, so we can filter these out here
          if (notification.ExpirationDateTime && new Date(notification.ExpirationDateTime).getTime() < Date.now()) {
            return false;
          }
          return true;
        })
        .map((n) => IMessageRecordToIFlexNotification(n))
        .sort((a, b) => {
          // Sort by dispatch time, most recent first
          if (a.DispatchedDateTime && b.DispatchedDateTime) {
            return new Date(b.DispatchedDateTime).getTime() - new Date(a.DispatchedDateTime).getTime();
          }
          // If one of the records doesnt have a dispatch time - move it to the back
          return !a.DispatchedDateTime ? 1 : -1;
        }),
      statusCode: 200,
    };
  }
}

// IoC Definition
export const handler = new GetNotifications(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  notificationsDynamoRepository: iocGetNotificationDynamoRepository(),
})).handler();
