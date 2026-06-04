import {
  HandlerDependencies,
  iocGetConfigurationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { NotificationDispatchedStateEnum } from '@common/models/NotificationStateEnum';
import { FlexAPIHandler } from '@common/operations/flexApiHandler';
import { NotificationsDynamoRepository } from '@common/repositories';
import { ConfigurationService, ObservabilityService } from '@common/services';
import {
  IFlexNotificationSchema,
  IMessageRecordToIFlexNotification,
} from '@project/lambdas/interfaces/IFlexNotification';
import type { Context } from 'aws-lambda';
import httpErrors from 'http-errors';
import z from 'zod';

const requestBodySchema = z.any();

/* Lambda Request Example
{
  "headers": {
    "x-api-key": "mockApiKey"
  },
  "requestContext": {
    "requestId": "c6af9ac6-7b61-11e6-9a41-93e8deadbeef",
    "requestTimeEpoch": 1428582896000
  },
  "pathParameters": {
    "notificationID": "12342"
  },
  "queryStringParameters": {
    "externalUserID": "USER_ID"
  } 
}
*/

export class GetFlexNotificationById extends FlexAPIHandler<typeof requestBodySchema, typeof IFlexNotificationSchema> {
  public operationId: string = 'getNotificationById';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = IFlexNotificationSchema;

  public notificationsDynamoRepository: NotificationsDynamoRepository;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<GetFlexNotificationById>
  ) {
    super(config, observability);
    this.injectDependencies(asyncDependencies);
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof IFlexNotificationSchema>>> {
    this.observability.logger.debug('Received request', {
      path: event.path,
      externalUserID: event.queryStringParameters?.externalUserID,
      requestId: context.awsRequestId,
    });

    const isValidApiKey = await this.validateApiKey(event);

    if (!isValidApiKey) {
      this.observability.logger.debug('Invalid api key - returning 401');
      throw new httpErrors.Unauthorized();
    }

    // Extract details
    const notificationID = event.pathParameters?.notificationID;
    const externalUserID = event.queryStringParameters?.externalUserID;

    // Handle missing path param
    if (!notificationID) {
      this.observability.logger.debug('Notification Id has not been provided - returning 401');
      throw new httpErrors.BadRequest();
    }

    const notification = await this.notificationsDynamoRepository.getRecord(notificationID);

    // Handle not found or hidden notifications
    if (!notification) {
      this.observability.logger.debug('Notification not found - returning 404');
      throw new httpErrors.NotFound();
    }

    // Handle notification that is past TTL expiration - DynamoDB can take up to 48h to remove these
    if (notification.ExpirationDateTime && new Date(notification.ExpirationDateTime).getTime() < Date.now()) {
      this.observability.logger.debug('Notification has expired - returning 404');
      throw new httpErrors.NotFound();
    }

    // Handle user not being the owner of the notification
    if (notification.ExternalUserID !== externalUserID) {
      this.observability.logger.debug('Notification belongs to another user - returning 404', {
        userOnNotification: notification.ExternalUserID,
        queryingUser: externalUserID,
      });
      throw new httpErrors.NotFound();
    }

    // If message is marked as hidden - return 404
    const notificationResponse = IMessageRecordToIFlexNotification(notification);

    if (notificationResponse.Status == NotificationDispatchedStateEnum.HIDDEN) {
      this.observability.logger.debug('Notfication has been marked as hidden - returning 404');
      throw new httpErrors.NotFound();
    }

    this.observability.logger.info('Successful request - returning 200', { notificationID });

    return {
      body: notificationResponse,
      statusCode: 200,
    };
  }
}

export const handler = new GetFlexNotificationById(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  notificationsDynamoRepository: iocGetNotificationDynamoRepository(),
})).handler();
