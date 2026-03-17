import {
  iocGetConfigurationService,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { FlexAPIHandler } from '@common/operations/flexApiHandler';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { IFlexNotification } from '@project/lambdas/interfaces/IFlexNotification';
import { MOCK_NOTIFICATIONS } from '@project/lambdas/mock/mockNotifications';
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
    "notificationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  },
  "body": {
    "Status": "READ"
  }
}
*/

export class MockPatchNotification extends FlexAPIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'mockPatchNotification';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(config, observability);
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    _context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    const isValidApiKey = await this.validateApiKey(event);
    if (!isValidApiKey) {
      throw new httpErrors.Unauthorized();
    }

    this.observability.logger.info('Mock: received patch request', { event });

    const notificationId = event.pathParameters?.notificationId;
    if (!notificationId) {
      this.observability.logger.info('Mock: notification ID not provided.');
      throw new httpErrors.BadRequest();
    }

    const exists = MOCK_NOTIFICATIONS.some((n: IFlexNotification) => n.NotificationID === notificationId);
    if (!exists) {
      this.observability.logger.info('Mock: notification not found.', { notificationId });
      throw new httpErrors.NotFound();
    }

    const { Status } = event.body;
    this.observability.logger.info('Mock: patch accepted.', { notificationId, status: Status });

    return {
      body: {},
      statusCode: 202,
    };
  }
}

export const handler = new MockPatchNotification(iocGetConfigurationService(), iocGetObservabilityService()).handler();
