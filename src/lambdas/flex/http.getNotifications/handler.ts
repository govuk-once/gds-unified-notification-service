import {
  HandlerDependencies,
  iocGetCacheService,
  iocGetConfigurationService,
  iocGetNotificationDynamoRepository,
  iocGetObservabilityService,
  iocGetOrganisationsDynamoRepository,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { BadRequestError } from '@common/models/Errors/BadRequestError';
import { NotificationDispatchedStateEnum } from '@common/models/NotificationStateEnum';
import { FlexAPIHandler } from '@common/operations/flexApiHandler';
import { NotificationsDynamoRepository, OrganisationsDynamoRepository } from '@common/repositories';
import { CacheService, ConfigurationService, ObservabilityService } from '@common/services';
import { filters } from '@common/utils/array';
import DateInSeconds from '@common/utils/dateInSeconds';
import { IAnalytics } from '@project/lambdas/interfaces';
import {
  IFlexNotificationSchema,
  IMessageRecordToIFlexNotification,
} from '@project/lambdas/interfaces/IFlexNotification';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = z.array(IFlexNotificationSchema);

export class GetNotifications extends FlexAPIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'getNotifications';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public notificationsDynamoRepository!: NotificationsDynamoRepository;
  public organisationsDynamoRepository!: OrganisationsDynamoRepository;
  public cacheService!: CacheService;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<GetNotifications>
  ) {
    super(config, observability);
    this.injectDependencies(asyncDependencies);
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    this.observability.logger.info('Received request', {
      path: event.path,
      notificationID: event.pathParameters?.notificationID,
      externalUserID: event.queryStringParameters?.externalUserID,
      pushID: event.queryStringParameters?.pushID,
      requestId: context.awsRequestId,
    });

    // Extract details
    const externalUserID = event.queryStringParameters?.externalUserID ?? event.queryStringParameters?.pushID;

    // Handle missing query param
    if (externalUserID == undefined || externalUserID === '') {
      this.observability.logger.info('pushID has not been provided - returning 400');
      throw new BadRequestError(['pushID has not been provided.']);
    }

    // Get notifications of user from dynamoDB
    const notifications = await this.notificationsDynamoRepository.getProcessedMessages(externalUserID);

    // Get display name for organisations from the organisation ID
    const organisations = await this.organisationsDynamoRepository.getOrganisations(notifications);

    this.observability.logger.info('Found notifications - returning 200', { length: notifications.length });

    // Retrieving cache events to compare with dynamo record
    const cachedEvents: Record<string, IAnalytics[]> = {};
    for (const notification of notifications) {
      cachedEvents[notification.NotificationID] = await this.cacheService.getList<IAnalytics>(
        this.cacheService.analyticsEventKey(notification.NotificationID)
      );
    }

    const responseBody = notifications
      .filter((notification) => {
        // Handle notifications that are past TTL expiration - DynamoDB can take up to 48h to remove these, so we can filter these out here
        if (notification.ExpirationDateTime < DateInSeconds.now()) {
          return false;
        }
        return true;
      })
      .map((n) =>
        IMessageRecordToIFlexNotification(n, organisations, this.observability, cachedEvents[n.NotificationID] ?? [])
      )
      .filter(filters.isDefined)
      .filter((n) => n.Status !== NotificationDispatchedStateEnum.HIDDEN)
      .sort((a, b) => {
        // Sort by dispatch time, most recent first
        if (a.DispatchedDateTime && b.DispatchedDateTime) {
          return new Date(b.DispatchedDateTime).getTime() - new Date(a.DispatchedDateTime).getTime();
        }
        // If one of the records doesn't have a dispatch time - move it to the back
        return a.DispatchedDateTime ? -1 : 1;
      });

    return {
      body: responseBody,
      statusCode: 200,
    };
  }
}

export const handler = new GetNotifications(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  notificationsDynamoRepository: iocGetNotificationDynamoRepository(),
  organisationsDynamoRepository: iocGetOrganisationsDynamoRepository(),
  cacheService: iocGetCacheService().connect(),
})).handler();
