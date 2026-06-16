import {
  HandlerDependencies,
  iocGetConfigurationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
  iocGetOrganisationsDynamoRepository,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { BadRequestError } from '@common/models/Errors/BadRequestError';
import { NotFoundError } from '@common/models/Errors/NotFoundError';
import { NotificationDispatchedStateEnum } from '@common/models/NotificationStateEnum';
import { FlexAPIHandler } from '@common/operations/flexApiHandler';
import { NotificationsDynamoRepository, OrganisationsDynamoRepository } from '@common/repositories';
import { ConfigurationService, ObservabilityService } from '@common/services';
import {
  IFlexNotificationSchema,
  IMessageRecordToIFlexNotification,
} from '@project/lambdas/interfaces/IFlexNotification';
import type { Context } from 'aws-lambda';
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
  public organisationsDynamoRepository: OrganisationsDynamoRepository;

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
      notificationID: event.pathParameters?.notificationID,
      externalUserID: event.queryStringParameters?.externalUserID,
      pushID: event.queryStringParameters?.pushID,
      requestId: context.awsRequestId,
    });

    // Authorize
    await this.validateApiKey(event);

    // Extract details
    const notificationID = event.pathParameters?.notificationID;
    const externalUserID = event.queryStringParameters?.externalUserID ?? event.queryStringParameters?.pushID;

    // Handle missing path param
    if (notificationID == undefined) {
      this.observability.logger.info('NotificationID has not been provided - returning 400');
      throw new BadRequestError(['NotificationID has not been provided']);
    }

    // Handle missing query param
    if (externalUserID == undefined || externalUserID === '') {
      this.observability.logger.debug('PushID has not been provided - returning 400');
      throw new BadRequestError(['PushID has not been provided']);
    }

    const notification = await this.notificationsDynamoRepository.getRecord(notificationID);

    // Handle not found or hidden notifications
    if (!notification) {
      this.observability.logger.debug('Notification not found - returning 404');
      throw new NotFoundError();
    }

    // Handle notification that is past TTL expiration - DynamoDB can take up to 48h to remove these
    if (notification.ExpirationDateTime && new Date(notification.ExpirationDateTime).getTime() < Date.now()) {
      this.observability.logger.debug('Notification has expired - returning 404');
      throw new NotFoundError();
    }

    // Handle user not being the owner of the notification
    if (notification.ExternalUserID !== externalUserID) {
      this.observability.logger.debug('Notification belongs to another user - returning 404', {
        userOnNotification: notification.ExternalUserID,
        queryingUser: externalUserID,
      });
      throw new NotFoundError();
    }

    // Get display name for organisations from the organisation ID
    const organisations = await this.organisationsDynamoRepository.getOrganisations([notification]);
    const notificationResponse = IMessageRecordToIFlexNotification(notification, organisations, this.observability);

    // If no organisation record matches the organisation - return 404
    if (!notificationResponse) {
      this.observability.logger.debug('Notification failed parsing to flex notification - returning 404');
      throw new NotFoundError();
    }

    // If message is marked as hidden - return 404
    if (notificationResponse.Status == NotificationDispatchedStateEnum.HIDDEN) {
      this.observability.logger.debug('Notification has been marked as hidden - returning 404');
      throw new NotFoundError();
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
  organisationsDynamoRepository: iocGetOrganisationsDynamoRepository(),
})).handler();
