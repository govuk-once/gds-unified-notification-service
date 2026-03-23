import {
  APIHandler,
  defineContract,
  HandlerDependencies,
  IAPIContractEvent,
  IAPIContractResponse,
  iocGetAnalyticsService,
  iocGetConfigurationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
} from '@common';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { NotificationsDynamoRepository } from '@common/repositories';
import { AnalyticsService, ConfigurationService, ObservabilityService } from '@common/services';
import {
  PatchNotificationByIDBody,
  PatchNotificationByIDParams,
  PatchNotificationByIDQueryParams,
} from '@generated/flex';
import type { Context } from 'aws-lambda';
import httpErrors from 'http-errors';
import z from 'zod';

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
  } ,
  "body": {
    "status": "READ"  
  }
}
*/

const contract = defineContract({
  requestBodySchema: PatchNotificationByIDBody.extend({
    Status: z.preprocess(
      (val) => (typeof val === 'string' ? val.toUpperCase() : val),
      z.enum([NotificationStateEnum.READ, NotificationStateEnum.MARKED_AS_UNREAD])
    ),
  }),
  requestPathParametersSchema: PatchNotificationByIDParams,
  requestQueryParametersSchema: PatchNotificationByIDQueryParams,
  responseBodySchema: z.object(),
});

export class PatchNotification extends APIHandler<typeof contract> {
  // API Definition
  public operationId: string = 'patchNotification';
  public contract = contract;

  // Services & Repositories
  public notificationsDynamoRepository: NotificationsDynamoRepository;
  public analytics: AnalyticsService;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<PatchNotification>
  ) {
    super(observability);
    this.injectDependencies(asyncDependencies);
  }

  public async implementation(
    event: IAPIContractEvent<typeof contract>,
    context: Context
  ): Promise<IAPIContractResponse<typeof contract>> {
    this.observability.logger.info('Received request', { event });
    // Validate
    const notificationID = event.pathParameters?.notificationID;
    const externalUserID = event.queryStringParameters?.externalUserID;
    if (!notificationID) {
      this.observability.logger.info('Notification Id has not been provided.');
      throw new httpErrors.BadRequest();
    }

    // Confirm existence & ownership
    const notification = await this.notificationsDynamoRepository.getRecord(notificationID);
    if (!notification) {
      this.observability.logger.info('Notification does not exists');
      throw new httpErrors.NotFound();
    }

    // Handle user not being the owner of the notification
    if (notification.ExternalUserID !== externalUserID) {
      throw new httpErrors.NotFound();
    }

    // Fire off a request with status up to analytics lambda
    await this.analytics.publishEvent(notification, event.body.Status);

    this.observability.logger.info('Successful request', { notificationID, status: event.body.Status });

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
