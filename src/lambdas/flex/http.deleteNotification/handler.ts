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
import { DeleteNotificationByIDParams, DeleteNotificationByIDQueryParams } from '@generated/flex';
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
  "pathParameters": {
    "notificationID": "12342"
  }   
}
*/

const contract = defineContract({
  requestBodySchema: z.object(),
  requestPathParametersSchema: DeleteNotificationByIDParams,
  requestQueryParametersSchema: DeleteNotificationByIDQueryParams,
  responseBodySchema: z.object({}),
});

export class DeleteNotification extends APIHandler<typeof contract> {
  // API Definition
  public operationId: string = 'deleteNotification';
  public contract = contract;

  // Services & Repositories
  public notificationsDynamoRepository: NotificationsDynamoRepository;
  public analyticsService: AnalyticsService;

  // Constructor
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<DeleteNotification>
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
    const notificationID = event.pathParameters?.notificationID;
    const externalUserID = event.queryStringParameters?.externalUserID;

    // Handle missing path param
    if (!notificationID) {
      this.observability.logger.info('Notification Id has not been provided.');
      throw new httpErrors.BadRequest();
    }

    const notification = await this.notificationsDynamoRepository.getRecord(notificationID);

    if (!notification) {
      this.observability.logger.info('Notification Id has not been provided.');
      throw new httpErrors.NotFound();
    }

    // Handle user not being the owner of the notification
    if (notification.ExternalUserID !== externalUserID) {
      throw new httpErrors.NotFound();
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
