import {
  HandlerDependencies,
  iocGetConfigurationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { BadRequestError } from '@common/models/Errors/BadRequestError';
import { NotificationDispatchedStateEnum } from '@common/models/NotificationStateEnum';
import { FlexAPIHandler } from '@common/operations/flexApiHandler';
import { NotificationsDynamoRepository } from '@common/repositories';
import { ConfigurationService, ObservabilityService } from '@common/services';
import {
  IFlexNotificationSchema,
  IMessageRecordToIFlexNotification,
} from '@project/lambdas/interfaces/IFlexNotification';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = z.array(IFlexNotificationSchema);

/* Lambda Request Example
{
  "headers": {
    "x-api-key": "mockApiKey"
  },
  "requestContext": {
    "requestId": "c6af9ac6-7b61-11e6-9a41-93e8deadbeef",
    "requestTimeEpoch": 1428582896000
  },
  "queryStringParameters": {
    "externalUserID": "USER_ID"
  }  
}
*/

export class GetNotifications extends FlexAPIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'getNotifications';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public notificationsDynamoRepository: NotificationsDynamoRepository;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<GetNotifications>
  ) {
    super(config, observability);
    this.injectDependencies(asyncDependencies);
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    this.observability.logger.debug('Received request', {
      path: event.path,
      notificationID: event.pathParameters?.notificationID,
      externalUserID: event.queryStringParameters?.externalUserID,
      pushID: event.queryStringParameters?.pushID,
      requestId: context.awsRequestId,
    });

    // Authorize
    await this.validateApiKey(event);

    // Extract details
    const externalUserID = event.queryStringParameters?.externalUserID ?? event.queryStringParameters?.pushID;

    // Handle missing query param
    if (externalUserID == undefined || externalUserID === '') {
      this.observability.logger.debug('PushID has not been provided - returning 400');
      throw new BadRequestError(['PushID has not been provided.']);
    }

    const notifications = await this.notificationsDynamoRepository.getRecords<IMessageRecord>({
      field: 'ExternalUserID',
      value: externalUserID,
    });

    this.observability.logger.info('Found notifications - returning 200', { length: notifications.length });
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
        .filter((n) => n.Status !== NotificationDispatchedStateEnum.HIDDEN)
        .sort((a, b) => {
          // Sort by dispatch time, most recent first
          if (a.DispatchedDateTime && b.DispatchedDateTime) {
            return new Date(b.DispatchedDateTime).getTime() - new Date(a.DispatchedDateTime).getTime();
          }
          // If one of the records doesnt have a dispatch time - move it to the back
          return a.DispatchedDateTime ? -1 : 1;
        }),
      statusCode: 200,
    };
  }
}

export const handler = new GetNotifications(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  notificationsDynamoRepository: iocGetNotificationDynamoRepository(),
})).handler();
