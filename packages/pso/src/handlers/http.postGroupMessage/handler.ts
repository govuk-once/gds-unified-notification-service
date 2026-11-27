import {
  APIHandler,
  ConfigurationService,
  GroupStoreDynamoRepository,
  HandlerDependencies,
  iocGetConfigurationService,
  iocGetGroupProcessingQueueService,
  iocGetGroupStoreDynamoRepository,
  iocGetObservabilityService,
  iocGetValidationService,
  ObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { psoAuthorizerSchema } from '@common/middlewares/interfaces/IAuthorizer';
import { GroupProcessingQueueService } from '@common/services/groupProcessingQueueService';
import { ValidationService } from '@common/services/validationService';
import { chunkArray } from '@common/utils/chunkArray';
import { IGroupMessage, IGroupMessageMetadata, IGroupMessageSchema } from '@common/models/interfaces';
import SSMParameters from '@shared/ssmParameter';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z
  .array(IGroupMessageSchema.omit({ OrganisationID: true }).strict())
  .min(1)
  .superRefine((messages, ctx) => {
    // Checks for duplicate GroupNotificationIDs
    const seen = new Set<string>();
    for (let i = 0; i < messages.length; i++) {
      const id = messages[i].GroupNotificationID;
      if (seen.has(id)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate GroupNotificationIDs are not allowed',
          path: [i, 'GroupNotificationID'],
        });
        return;
      }
      seen.add(id);
    }
  });
const responseBodySchema = z.array(z.object({ GroupNotificationID: z.string(), UsersInGroup: z.int().min(0) }));
const authorizerSchema = psoAuthorizerSchema;

/**
{
  "body": "{\n  \"Namespace\": \"travel\", \n  \"Group\": \"france\",\n  \"Subgroup\": \"immediate\",\n  \"GroupNotificationID\": \"TO_GROUP_ID\",\n  \"CampaignID\": \"CAM_ID\",\n  \"NotificationTitle\": \"You have a new Notification\",\n  \"NotificationBody\": \"Here is the Notification body.\",\n  \"MessageTitle\": \"You have a new Message\",\n  \"MessageBody\": \"Open Notification Centre to read your notifications\",\n  \"DeeplinkURL\": \"appid://path/to/page\"\n}",
  "headers": {
    "Content-Type": "application/json"
  },
  "requestContext": {
    "requestId": "c6af9ac6-7b61-11e6-9a41-93e8deadbeef",
    "requestTimeEpoch": 1428582896000,
    "authorizer": { "Organization": "ORG01", "OrganisationConfig": "{\"MessageRetention\":{\"Allowed\":false},\"Channels\":[]}" }
  }
}
*/
/**
* Sample post body:
{
  "Namespace": "travel", 
  "Group": "france",
  "Subgroup": "immediate",
  "GroupNotificationID": "TO_GROUP_ID",
  "CampaignID": "CAM_ID",
  "NotificationTitle": "You have a new Notification",
  "NotificationBody": "Here is the Notification body.",
  "MessageTitle": "You have a new Message",
  "MessageBody": "Open Notification Centre to read your notifications",
  "DeeplinkURL": "appid://path/to/page"
}
 */

export class PostGroupMessage extends APIHandler<
  typeof requestBodySchema,
  typeof responseBodySchema,
  typeof authorizerSchema
> {
  public operationId: string = 'postGroupMessage';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;
  public authorizerSchema = authorizerSchema;

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
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>, z.infer<typeof authorizerSchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    this.observability.logger.info('Received request', {
      path: event.path,
      organisationID: event.requestContext.authorizer.Organization,
      requestId: context.awsRequestId,
    });
    const organisationID = event.requestContext.authorizer.Organization;
    const organisationConfig = event.requestContext.authorizer.OrganisationConfig;

    // TODO: when the client omits GroupNotificationID the schema generates a random one per request, so a client retry
    // produces different notification IDs and is not deduplicated. Consider requiring it or deriving it deterministically.
    const messages: IGroupMessage[] = event.body.map((body) => ({
      ...body,
      OrganisationID: organisationID,
    }));

    // Validates all messages & reject request when contents or configurations are unsupported
    this.validationService.messageValidation(messages, organisationConfig);

    // Get the number of pushIDs to send to the group processing worker in each queue message
    const chunkSize = await this.config.getParameter(SSMParameters.Group.Dispatch.ChunkSize);

    const responses: { GroupNotificationID: string; UsersInGroup: number }[] = [];
    for (const message of messages) {
      const pushIds = await this.groupStoreDynamoRepository.getUsersInGroup(
        message.Namespace,
        message.Group,
        message.Subgroup
      );

      const batch: IGroupMessageMetadata[] = chunkArray(pushIds, chunkSize).map((chunk) => ({
        GroupMessage: message,
        GroupNotificationID: message.GroupNotificationID,
        PushIDs: chunk,
        APIGWExtendedID: event.requestContext.requestId,
        ReceivedDateTime: new Date(event.requestContext.requestTimeEpoch).toISOString(),
        ValidatedDateTime: new Date().toISOString(),
      }));

      this.observability.logger.debug('Requeuing validated group message to group process queue.', {
        GroupNotificationID: message.GroupNotificationID,
        usersInGroup: pushIds.length,
        chunks: batch.length,
      });
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
  groupProcessingQueue: iocGetGroupProcessingQueueService(),
  groupStoreDynamoRepository: iocGetGroupStoreDynamoRepository(),
  validationService: iocGetValidationService(),
})).handler();
