import {
  APIHandler,
  HandlerDependencies,
  iocGetInboundDynamoRepository,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { InboundDynamoRepository } from '@common/repositories';
import { ObservabilityService } from '@common/services';
import type { Context } from 'aws-lambda';
import httpErrors from 'http-errors';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = z.array(
  z.object({
    NotificationID: z.string(),
    EventTimestamp: z.string(),
    Status: z.enum([
      NotificationStateEnum.UNKNOWN,
      NotificationStateEnum.RECEIVED,
      NotificationStateEnum.VALIDATING,
      NotificationStateEnum.VALIDATED,
      NotificationStateEnum.VALIDATED_API_CALL,
      NotificationStateEnum.VALIDATION_FAILED,
      NotificationStateEnum.PROCESSING,
      NotificationStateEnum.PROCESSED,
      NotificationStateEnum.PROCESSING_FAILED,
      NotificationStateEnum.DISPATCHING,
      NotificationStateEnum.DISPATCHED,
      NotificationStateEnum.DISPATCHING_FAILED,
      NotificationStateEnum.READ,
      NotificationStateEnum.MARKED_AS_UNREAD,
      NotificationStateEnum.HIDDEN,
    ]),
  })
);

export class GetNotificationStatus extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'getNotificationStatus';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public inboundNotificationTable: InboundDynamoRepository;

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
    const notification = await this.inboundNotificationTable.getRecord(_event.pathParameters.notificationId ?? '');

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
      })),
      statusCode: 200,
    };
  }
}

export const handler = new GetNotificationStatus(iocGetObservabilityService(), () => ({
  inboundNotificationTable: iocGetInboundDynamoRepository(),
})).handler();
