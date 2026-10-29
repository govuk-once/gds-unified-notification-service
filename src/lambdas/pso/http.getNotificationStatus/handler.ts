import {
  APIHandler,
  HandlerDependencies,
  iocGetCacheService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { NotFoundError } from '@common/models/Errors/NotFoundError';
import { NotificationsDynamoRepository } from '@common/repositories';
import { CacheService, ObservabilityService } from '@common/services';
import { IAnalytics } from '@project/lambdas/interfaces';
import { INotificationStatusSchema } from '@project/lambdas/interfaces/INotificationStatus';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = z.array(INotificationStatusSchema);

export class GetNotificationStatus extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'getNotificationStatus';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public notificationsDynamoRepository!: NotificationsDynamoRepository;
  public cacheService!: CacheService;

  constructor(
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<GetNotificationStatus>
  ) {
    super(observability);
    this.injectDependencies(asyncDependencies);
  }

  public async implementation(
    _event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,

    _context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    this.observability.logger.info('Received request', {
      path: _event.path,
      notificationID: _event.pathParameters.notificationID,
      requestId: _context.awsRequestId,
    });

    // Fetch notification
    const notification = await this.notificationsDynamoRepository.getRecord(_event.pathParameters.notificationID ?? '');

    // If it doesn't exist - 404
    if (notification == null) {
      this.observability.logger.info('Notification does not exists - returning 404');
      throw new NotFoundError();
    }
    this.observability.logger.info(`Found notification`, { notification });

    // Compared dynamo record to cached events and adds any missing events to response
    const cachedEvents = await this.cacheService.getList<IAnalytics>(
      this.cacheService.analyticsEventKey(_event.pathParameters.notificationID ?? '')
    );
    if (cachedEvents.length > 0) {
      this.observability.logger.info(`Retrieved events from cache`, {
        EventIDs: cachedEvents.map(({ EventID }) => EventID),
      });
      const notificationEventIDs = new Set(notification.Events.map((n) => n.EventID));
      const missingEvents = cachedEvents.filter((e) => !notificationEventIDs.has(e.EventID));

      if (missingEvents.length > 0) {
        this.observability.logger.info(`Events missing from dynamo records`, {
          MissingEventIDs: missingEvents.map(({ EventID }) => EventID),
        });
      }

      notification.Events = [...notification.Events, ...missingEvents];
    }

    this.observability.logger.info('Successful request - returning 200', {
      notification,
    });

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
  cacheService: iocGetCacheService().connect(),
})).handler();
