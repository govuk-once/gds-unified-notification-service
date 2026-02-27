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
import { IFlexNotification, IFlexNotificationSchema } from '@project/lambdas/interfaces/IFlexNotification';
import type { Context } from 'aws-lambda';
import httpErrors from 'http-errors';
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
    "ExternalUserID": "user-ABC"
  }  
}
*/

export class GetNotifications extends FlexAPIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'getNotifications';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public inboundNotificationTable: InboundDynamoRepository;

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
    try {
      // Authorize
      const isValidApiKey = await this.validateApiKey(event);
      if (!isValidApiKey) {
        throw new httpErrors.Unauthorized();
      }

      const externalUserId = event.queryStringParameters?.externalUserId;
      if (!externalUserId) {
        throw new httpErrors.BadRequest();
      }

      const notifications = await this.inboundNotificationTable.getRecords<IFlexNotification>({
        field: 'ExternalUserID',
        value: externalUserId,
      });

      return {
        body: notifications.map((n) => IFlexNotificationSchema.parse({ ...n, Status: 'UNREAD' })),
        statusCode: 200,
      };
    } catch (error) {
      this.observability.logger.error('Fatal exception: ', { error });
      throw new httpErrors.InternalServerError();
    }
  }
}

export const handler = new GetNotifications(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  inboundNotificationTable: iocGetInboundDynamoRepository(),
})).handler();
