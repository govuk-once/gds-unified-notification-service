import {
  iocGetConfigurationService,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { FlexAPIHandler } from '@common/operations/flexApiHandler';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { IFlexNotificationSchema } from '@project/lambdas/interfaces/IFlexNotification';
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
  "queryStringParameters": {
    "externalUserId": "user-ABC"
  }
}
*/

export class MockGetNotifications extends FlexAPIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'mockGetNotifications';
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

    const externalUserId = event.queryStringParameters?.externalUserId;
    if (!externalUserId) {
      throw new httpErrors.BadRequest();
    }

    this.observability.logger.info('Mock: returning stub notifications', { externalUserId });

    return {
      body: MOCK_NOTIFICATIONS.map((n) => IFlexNotificationSchema.parse(n)),
      statusCode: 200,
    };
  }
}

export const handler = new MockGetNotifications(iocGetConfigurationService(), iocGetObservabilityService()).handler();
