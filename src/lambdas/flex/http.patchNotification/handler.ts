import {
  HandlerDependencies,
  iocGetAnalyticsService,
  iocGetConfigurationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { FlexAPIHandler } from '@common/operations/flexApiHandler';
import { NotificationsDynamoRepository } from '@common/repositories';
import { AnalyticsService, ConfigurationService, ObservabilityService } from '@common/services';
import type { Context } from 'aws-lambda';
import httpErrors from 'http-errors';
import z from 'zod';

const requestBodySchema = z.object({
  Status: z.preprocess(
    (val) => (typeof val === 'string' ? val.toUpperCase() : val),
    z.enum([NotificationStateEnum.READ, NotificationStateEnum.MARKED_AS_UNREAD, NotificationStateEnum.RECEIVED])
  ),
});
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
  "pathParemters": {
    "id": "12342"
  },
  "queryStringParameters": {
    "externalUserID": "USER_ID"
  } 
  "body": {
    "status": "READ"  
  }
}
*/

export class PatchNotification extends FlexAPIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'patchNotification';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public notificationsDynamoRepository: NotificationsDynamoRepository;
  public analytics: AnalyticsService;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<PatchNotification>
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
    const isValidApiKey = await this.validateApiKey(event);
    if (!isValidApiKey) {
      this.observability.logger.debug('Invalid api key - returning 401');
      throw new httpErrors.Unauthorized();
    }

    // Validate
    const notificationID = event.pathParameters?.notificationID;
    const externalUserID = event.queryStringParameters?.externalUserID ?? event.queryStringParameters?.pushID;

    if (notificationID == undefined) {
      this.observability.logger.debug('Notification Id has not been provided - returning 400');
      throw new httpErrors.BadRequest();
    }
    // Handle missing query param
    if (externalUserID == undefined || externalUserID === '') {
      this.observability.logger.debug('Push Id has not been provided - returning 400');
      throw new httpErrors.BadRequest();
    }

    // Confirm existence & ownership
    const notification = await this.notificationsDynamoRepository.getRecord(notificationID);
    if (!notification) {
      this.observability.logger.debug('Notification does not exists - returning 404');
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

    // Fire off a request with status up to analytics lambda
    await this.analytics.publishEvent(notification, event.body.Status);

    this.observability.logger.debug('Successful request - returning 200', {
      notificationID,
      status: event.body.Status,
    });

    return {
      body: {},
      statusCode: 202,
    };
  }
}

export const handler = new PatchNotification(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  notificationsDynamoRepository: iocGetNotificationDynamoRepository(),
  analytics: iocGetAnalyticsService(),
})).handler();
