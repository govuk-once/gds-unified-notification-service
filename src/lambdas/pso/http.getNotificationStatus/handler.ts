import {
  APIHandler,
  HandlerDependencies,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { NotificationsDynamoRepository } from '@common/repositories';
import { ObservabilityService } from '@common/services';
import { INotificationStatusSchema } from '@project/lambdas/interfaces/INotificationStatus';
import type { Context } from 'aws-lambda';
import httpErrors from 'http-errors';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = INotificationStatusSchema;

export class GetNotificationStatus extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'getNotificationStatus';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public notificationsDynamoRepository: NotificationsDynamoRepository;

  constructor(
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<GetNotificationStatus>
  ) {
    super(observability);
    this.injectDependencies(asyncDependencies);
  }

  public async implementation(
    _event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    // Fetch notification
    const notification = await this.notificationsDynamoRepository.getRecord(_event.pathParameters.notificationID ?? '');

    // If it doesnt exist - 404
    if (notification == null) {
      throw new httpErrors.NotFound();
    }

    this.observability.logger.info(`Found notification`, { notification });
    // If it does - return it's status only
    return {
      body: notification.Events.map((event) => ({
        Status: event.Event,
        NotificationID: event.NotificationID,
        EventTimestamp: event.EventDateTime,
      })).sort((a, b) => a.EventTimestamp.localeCompare(b.EventTimestamp)),
      statusCode: 200,
    };
  }
}

export const handler = new GetNotificationStatus(iocGetObservabilityService(), () => ({
  notificationsDynamoRepository: iocGetNotificationDynamoRepository(),
})).handler();
