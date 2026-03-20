import {
  HandlerDependencies,
  iocGetConfigurationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
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
    "notificationId": "12342"
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
    const isValidApiKey = await this.validateApiKey(event);

    if (!isValidApiKey) {
      throw new httpErrors.Unauthorized();
    }

    // Extract details
    const notificationId = event.pathParameters?.notificationId;
    const externalUserId = event.queryStringParameters?.externalUserId;

    // Handle missing path param
    if (!notificationId) {
      this.observability.logger.info('Notification Id has not been provided.');
      throw new httpErrors.BadRequest();
    }

    const notification = await this.notificationsDynamoRepository.getRecord(notificationId);

    // Handle not found or hidden notifications
    if (!notification) {
      throw new httpErrors.NotFound();
    }

    // Handle notification that is past TTL expiration - DynamoDB can take up to 48h to remove these
    if (notification.ExpirationDateTime && new Date(notification.ExpirationDateTime).getTime() < Date.now()) {
      throw new httpErrors.NotFound();
    }

    // Handle user not being the owner of the notification
    if (notification.ExternalUserID !== externalUserId) {
      throw new httpErrors.NotFound();
    }

    // If message is marked as hidden - return 404
    const notificationResponse = IMessageRecordToIFlexNotification(notification);

    if (notificationResponse.Status == NotificationStateEnum.HIDDEN) {
      throw new httpErrors.NotFound();
    }

    this.observability.logger.info('Successful request.', { notificationId });

    return {
      body: notificationResponse,
      statusCode: 200,
    };
  }
}

export const handler = new GetFlexNotificationById(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  notificationsDynamoRepository: iocGetNotificationDynamoRepository(),
})).handler();
