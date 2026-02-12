import {
  APIHandler,
  HandlerDependencies,
  iocGetConfigurationService,
  iocGetObservabilityService,
  StringParameters,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { IFlexNotificationSchema } from '@project/lambdas/interfaces/IFlexNotification';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = z.array(IFlexNotificationSchema);

/* Lambda Request Example
{
  "body": "[]",
  "headers": {
    "x-api-key": "mockApiKey",
    "Content-Type": "application/json"
  },
  "requestContext": {
    "requestId": "c6af9ac6-7b61-11e6-9a41-93e8deadbeef",
    "requestTimeEpoch": 1428582896000
  }
}
*/

export class GetFlexNotification extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'getFlexNotification';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<GetFlexNotification>
  ) {
    super(observability);
    this.injectDependencies(asyncDependencies);
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    const apiKey = await this.config.getParameter(StringParameters.Api.Flex.ApiKey);

    try {
      if (event.headers['x-api-key'] !== apiKey) {
        this.observability.logger.error('No matching API key: ', { apiKey });
        return {
          body: [],
          statusCode: 401,
        };
      }

      this.observability.logger.info('Successful request.');

      return {
        body: [
          {
            NotificationID: '1234',
            MessageTitle: 'You have a new Message',
            MessageBody: 'Open Notification Centre to read your notifications',
            NotificationTitle: 'You have a new Notification',
            NotificationBody: 'Here is the Notification body.',
            Status: 'PENDING',
            DispatchedAt: Date.now().toString(),
          },
        ],
        statusCode: 200,
      };
    } catch (error) {
      this.observability.logger.error('Fatal excpetion: ', { error });
      return {
        body: [],
        statusCode: 500,
      };
    }
  }
}

export const handler = new GetFlexNotification(iocGetConfigurationService(), iocGetObservabilityService()).handler();
