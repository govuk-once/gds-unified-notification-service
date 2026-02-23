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
import { IFlexNotification } from '@project/lambdas/interfaces/IFlexNotification';
import type { Context } from 'aws-lambda';
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
  // TODO: Remove this when the tf APIGateway segement issue if fix
  "queryStringParameters": {
    "id": "12342"
  }  
}
*/

export class PatchFlexNotification extends FlexAPIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'patchFlexNotificationStatus';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public inboundNotificationTable: InboundDynamoRepository;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<PatchFlexNotification>
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
          body: { Message: 'Unauthorized' },
          statusCode: 401,
        };
      }

      const notificationId = event.queryStringParameters?.id;
      if (!notificationId) {
        this.observability.logger.info('Notification Id has not been provided.');
        return {
          body: { Message: 'Bad request' },
          statusCode: 400,
        };
      }

      const notification = await this.inboundNotificationTable.getRecord<IFlexNotification>(notificationId);

      if (!notification) {
        return {
          body: { Message: 'Not found' },
          statusCode: 404,
        };
      }

      const status = 'READ';
      const updatedAt = new Date().toISOString();
      await this.inboundNotificationTable.updateRecord({
        NotificationID: notificationId,
        Status: status,
        UpdatedAt: updatedAt,
      });

      this.observability.logger.info('Successful request.', { notificationId, status });

      return {
        body: {},
        statusCode: 202,
      };
    } catch (error) {
      this.observability.logger.error('Fatal exception: ', { error });
      return {
        body: { Message: 'Internal server error' },
        statusCode: 500,
      };
    }
  }
}

export const handler = new PatchFlexNotification(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  inboundNotificationTable: iocGetInboundDynamoRepository(),
})).handler();
