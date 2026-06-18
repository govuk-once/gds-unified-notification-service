import {
  HandlerDependencies,
  iocGetAnalyticsService,
  iocGetConfigurationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { BadRequestError } from '@common/models/Errors/BadRequestError';
import { NotFoundError } from '@common/models/Errors/NotFoundError';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { FlexAPIHandler } from '@common/operations/flexApiHandler';
import { NotificationsDynamoRepository } from '@common/repositories';
import { AnalyticsService, ConfigurationService, ObservabilityService } from '@common/services';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = z.any();

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

export class DeleteNotification extends FlexAPIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'deleteNotification';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public notificationsDynamoRepository: NotificationsDynamoRepository;
  public analyticsService: AnalyticsService;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<DeleteNotification>
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

    // Extract details
    const notificationID = event.pathParameters?.notificationID;
    const externalUserID = event.queryStringParameters?.externalUserID ?? event.queryStringParameters?.pushID;

    // Handle missing path param
    if (notificationID == undefined) {
      this.observability.logger.debug('NotificationID has not been provided - returning 400');
      throw new BadRequestError(['NotificationID has not been provided']);
    }

    // Handle missing query param
    if (externalUserID == undefined || externalUserID === '') {
      this.observability.logger.debug('PushID has not been provided - returning 400');
      throw new BadRequestError(['PushID has not been provided']);
    }

    const notification = await this.notificationsDynamoRepository.getRecord(notificationID);

    if (!notification) {
      this.observability.logger.debug('Notification does not exists - returning 404');
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

    // Trigger marking as hidden
    await this.analyticsService.publishEvent(notification, NotificationStateEnum.HIDDEN);

    return {
      body: {},
      statusCode: 204,
    };
  }
}

export const handler = new DeleteNotification(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  notificationsDynamoRepository: iocGetNotificationDynamoRepository(),
  analyticsService: iocGetAnalyticsService(),
})).handler();
