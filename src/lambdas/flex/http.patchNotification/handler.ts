import {
  HandlerDependencies,
  iocGetConfigurationService,
  iocGetInboundDynamoRepository,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { ValidationEnum } from '@common/models/ValidationEnum';
import { FlexAPIHandler } from '@common/operations/flexApiHandler';
import { InboundDynamoRepository } from '@common/repositories';
import { ConfigurationService, ObservabilityService } from '@common/services';
import type { Context } from 'aws-lambda';
import httpErrors from 'http-errors';
import z from 'zod';

const requestBodySchema = z.object({
  Status: z.enum([ValidationEnum.RECEIVED, ValidationEnum.READ, ValidationEnum.MARKED_AS_UNREAD]),
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
  } ,
  "body": {
    "status": "READ"  
  }
}
*/

export class PatchNotification extends FlexAPIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'patchNotification';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public inboundNotificationTable: InboundDynamoRepository;

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
    // Authorize
    const isValidApiKey = await this.validateApiKey(event);
    if (!isValidApiKey) {
      throw new httpErrors.Unauthorized();
    }

    this.observability.logger.info('Received request', { event });
    // Validate
    const notificationId = event.pathParameters?.notificationId;
    if (!notificationId) {
      this.observability.logger.info('Notification Id has not been provided.');
      throw new httpErrors.BadRequest();
    }

    // Confirm existence & ownership
    const notification = await this.inboundNotificationTable.getRecord(notificationId);
    if (!notification) {
      this.observability.logger.info('Notification has does not exists');
      throw new httpErrors.NotFound();
    }

    const { Status } = event.body;
    const updatedAt = new Date().toISOString();
    await this.inboundNotificationTable.updateRecord({
      NotificationID: notificationId,
      Status,
      UpdatedAt: updatedAt,
    });

    this.observability.logger.info('Successful request.', { notificationId, status: Status });

    return {
      body: {},
      statusCode: 202,
    };
  }
}

export const handler = new PatchNotification(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  inboundNotificationTable: iocGetInboundDynamoRepository(),
})).handler();
