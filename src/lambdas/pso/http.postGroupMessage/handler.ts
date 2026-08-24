import {
  APIHandler,
  CacheService,
  ConfigurationService,
  GroupStoreDynamoRepository,
  HandlerDependencies,
  iocGetCacheService,
  iocGetConfigurationService,
  iocGetGroupProcessingQueueService,
  iocGetGroupStoreDynamoRepository,
  iocGetObservabilityService,
  iocGetValidationService,
  NumericParameters,
  ObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { GroupProcessingQueueService } from '@common/services/groupProcessingQueueService';
import { ValidationService } from '@common/services/validationService';
import { splitArrayIntoChunks } from '@common/utils/splitArrayIntoChunks';
import { IGroupMessage, IGroupMessageMetadata, IGroupMessageSchema } from '@project/lambdas/interfaces';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.array(IGroupMessageSchema.omit({ OrganisationID: true }).strict()).min(1);
const responseBodySchema = z.array(z.object({ GroupNotificationID: z.string(), UsersInGroup: z.int().min(0) }));

/**
* Sample post body:
    {
      "Namespace": "travel",
      "Group": "france",
      "Subgroup": "immediate",
      "GroupNotificationID": "TO_GROUP_ID"
      "CampaignID:" "CAM_ID",
      "NotificationTitle": "You have a new Notification",
      "NotificationBody": "Here is the Notification body."
      "MessageTitle": "You have a new Message",
      "MessageBody": "Open Notification Centre to read your notifications",
      "DeeplinkURL": "myappid://path/to/page"
    }
 */

export class PostGroupMessage extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'postGroupMessage';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public readonly cacheService!: CacheService;
  public readonly groupProcessingQueue!: GroupProcessingQueueService;
  public readonly groupStoreDynamoRepository!: GroupStoreDynamoRepository;
  public readonly validationService!: ValidationService;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    dependencies?: () => HandlerDependencies<PostGroupMessage>
  ) {
    super(observability);
    this.injectDependencies(dependencies);
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    this.observability.logger.info('Received request', { event });
    const { organisationID, organisationConfig } = this.extractOrganisationConfiguration(event);

    const messages: IGroupMessage[] = event.body.map((body) => ({
      ...body,
      OrganisationID: organisationID,
    }));

    // Validates all messages & reject request when contents or configurations are unsupported
    this.validationService.messageValidation(messages, organisationConfig);

    // Get the number of workers to be used to process the group message
    const numberOfWorkers = await this.config.getNumericParameter(NumericParameters.Group.Dispatch.WorkerCount);

    const responses: { GroupNotificationID: string; UsersInGroup: number }[] = [];
    for (const message of messages) {
      const pushIds = await this.groupStoreDynamoRepository.getUsersInGroup(
        message.Namespace,
        message.Group,
        message.Subgroup
      );
      const chunksOfPushIDs = splitArrayIntoChunks(pushIds, numberOfWorkers);

      const batch: IGroupMessageMetadata[] = [];
      for (let workerID = 0; workerID < chunksOfPushIDs.length; workerID += 1) {
        const chunk = chunksOfPushIDs[workerID];
        // If the chunk is empty, break the loop to avoid creating an empty cache entry and batch message
        if (chunk.length === 0) {
          break;
        }

        const cacheKey = `Worker/GroupProcessingWorker/${message.GroupNotificationID}/${workerID}`;
        this.observability.logger.debug('Storing list of pushIDs to process in cache for group processing worker.', {
          cacheKey,
          pushIDsLength: chunk.length,
        });
        await this.cacheService.store(cacheKey, chunk);

        batch.push({
          GroupMessage: message,
          GroupNotificationID: message.GroupNotificationID,
          WorkerID: workerID,
          CacheKey: cacheKey,
          APIGWExtendedID: event.requestContext.requestId,
          ReceivedDateTime: new Date(event.requestContext.requestTimeEpoch).toISOString(),
          ValidatedDateTime: new Date().toISOString(),
        });

        // Log to verify the CacheKey has been correctly stored and configured
        const elasticacheValue = await this.cacheService.get<string[]>(cacheKey);
        this.observability.logger.debug(`Verifying CacheKey and length of pushIDs for the batch in the cache.`, {
          cacheKey,
          batchLength: elasticacheValue?.length,
        });
      }

      this.observability.logger.debug(
        'Requeuing validated group message to group process queue.',
        message.GroupNotificationID
      );
      await this.groupProcessingQueue.publishMessageBatch(batch);
      responses.push({ GroupNotificationID: message.GroupNotificationID, UsersInGroup: pushIds.length });
    }

    this.observability.logger.info('Successful request - returning 202', {
      responses,
    });
    return {
      body: responses.map((response) => ({
        GroupNotificationID: response.GroupNotificationID,
        UsersInGroup: response.UsersInGroup,
      })),
      statusCode: 202,
    };
  }
}

export const handler = new PostGroupMessage(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  cacheService: iocGetCacheService().connect(),
  groupProcessingQueue: iocGetGroupProcessingQueueService(),
  groupStoreDynamoRepository: iocGetGroupStoreDynamoRepository(),
  validationService: iocGetValidationService(),
})).handler();
