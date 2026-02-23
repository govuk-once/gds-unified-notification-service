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
const responseBodySchema = z.union([z.array(IFlexNotificationSchema), z.object({ Message: z.string() })]);

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

export class GetFlexNotification extends FlexAPIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'getFlexNotification';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public inboundNotificationTable: InboundDynamoRepository;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<GetFlexNotification>
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
        return {
          body: [],
          statusCode: 401,
        };
      }

      const notification = await this.inboundNotificationTable.getRecords<IFlexNotification>();

      this.observability.logger.info('Successful request.');

      return {
        body: notification,
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

export const handler = new GetFlexNotification(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  inboundNotificationTable: iocGetInboundDynamoRepository(),
})).handler();
