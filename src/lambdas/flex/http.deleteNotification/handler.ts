import {
  HandlerDependencies,
  iocGetConfigurationService,
  iocGetInboundDynamoRepository,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { FlexAPIHandler } from '@common/operations/flexApiHandler';
import { InboundDynamoRepository } from '@common/repositories';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { IFlexNotificationSchema } from '@project/lambdas/interfaces/IFlexNotification';
import type { Context } from 'aws-lambda';
import httpErrors from 'http-errors';
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
    "notificationId": "12342"
  }  
}
*/

export class DeleteNotification extends FlexAPIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'deleteNotification';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public inboundNotificationTable: InboundDynamoRepository;

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
    try {
      const isValidApiKey = await this.validateApiKey(event);

      if (!isValidApiKey) {
        throw new httpErrors.Unauthorized();
      }

      const notificationId = event.pathParameters?.notificationId;
      if (!notificationId) {
        this.observability.logger.info('Notification Id has not been provided.');
        throw new httpErrors.BadRequest();
      }

      const notification = await this.inboundNotificationTable.deleteRecord(notificationId);

      return {
        body: IFlexNotificationSchema.parse(notification),
        statusCode: 204,
      };
    } catch (error) {
      this.observability.logger.error('Fatal exception: ', { error });
      throw new httpErrors.InternalServerError();
    }
  }
}

export const handler = new DeleteNotification(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  inboundNotificationTable: iocGetInboundDynamoRepository(),
})).handler();
