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
        return {
          body: [],
          statusCode: 401,
        };
      }

      // TODO Filter by user id, sort by date
      const notifications = (await this.inboundNotificationTable.getRecords<IFlexNotification>()).filter(
        (n) => n.NotificationID == 'efe72235-d02a-45a9-b9d4-a04ff992fcc3'
      );

      return {
        body: notifications
          .map((n) => ({
            // TODO: Add fallbacks, probably can do something within zod schema and/or builder fn
            ...n,
            MessageTitle: n.MessageTitle ?? n.NotificationTitle,
            MessageBody: n.MessageBody ?? n.NotificationBody,
            // TODO: Figure out the current state & inject into response
            Status: 'UNREAD',
          }))
          .map((n) => IFlexNotificationSchema.parse(n)), // Adding parse here strips out any extra properties that may be in dynamodb object which we wouldnt like to expose
        statusCode: 200,
      };
    } catch (error) {
      this.observability.logger.error('Fatal exception: ', { error });
      return {
        body: [],
        statusCode: 500,
      };
    }
  }
}

export const handler = new GetNotifications(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  inboundNotificationTable: iocGetInboundDynamoRepository(),
})).handler();
