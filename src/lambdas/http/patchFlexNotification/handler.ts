import {
  APIHandler,
  HandlerDependencies,
  iocGetConfigurationService,
  iocGetFlexDynamoRepository,
  iocGetObservabilityService,
  StringParameters,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { FlexDynamoRepository } from '@common/repositories';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { IFlexNotification } from '@project/lambdas/interfaces/IFlexNotification';
import type { Context } from 'aws-lambda';
import z from 'zod';

//Update this...
const requestBodySchema = z.object({ Status: z.string() });
const responseBodySchema = z
  .array(z.object({ NotificationID: z.string(), Status: z.string(), UpdatedAt: z.string() }))
  .or(z.object());

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

export class PatchFlexNotification extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'patchFlexNotification';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public flexRepo: FlexDynamoRepository;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<PatchFlexNotification>
  ) {
    super(observability);
    this.injectDependencies(asyncDependencies);
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    try {
      const apiKey = await this.config.getParameter(StringParameters.Api.Flex.ApiKey);

      if (event.headers['x-api-key'] !== apiKey) {
        this.observability.logger.error('No matching API key: ', { apiKey });
        return {
          body: [],
          statusCode: 401,
        };
      }

      const notificationId = event.pathParameters?.id;
      if (!notificationId) {
        this.observability.logger.info('Notification Id has not been provided.');
        return {
          body: {},
          statusCode: 400,
        };
      }

      const notification = await this.flexRepo!.getRecord<IFlexNotification>(notificationId);

      if (!notification) {
        return {
          body: {},
          statusCode: 404,
        };
      }

      const { Status } = event.body;

      const updatedAt = new Date().toISOString();
      await this.flexRepo!.updateRecord({
        notificationId: notificationId,
        Status,
        updatedAt: updatedAt,
      });

      this.observability.logger.info('Successful request.', { notificationId, Status });

      return {
        body: [
          {
            NotificationID: notificationId,
            Status,
            UpdatedAt: updatedAt,
          },
        ],
        statusCode: 202,
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

export const handler = new PatchFlexNotification(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  flexRepo: iocGetFlexDynamoRepository(),
})).handler();
