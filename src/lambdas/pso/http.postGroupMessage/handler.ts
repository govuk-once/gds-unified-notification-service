import {
  APIHandler,
  CacheService,
  ConfigurationService,
  ContentValidationService,
  GroupStoreDynamoRepository,
  HandlerDependencies,
  iocGetCacheService,
  iocGetConfigurationService,
  iocGetContentValidationService,
  iocGetGroupStoreDynamoRepository,
  iocGetObservabilityService,
  ObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { BadRequestError } from '@common/models/Errors/BadRequestError';
import { splitIntoChunks } from '@common/utils/splitArrayIntoChunks';
import { IGroupMessage, IGroupMessageSchema } from '@project/lambdas/interfaces';
import type { Context } from 'aws-lambda';
import { v4 as uuid } from 'uuid';
import z from 'zod';

const requestBodySchema = z
  .array(
    IGroupMessageSchema.omit({ OrganisationID: true }).extend({ GroupNotificationID: z.string().optional() }).strict()
  )
  .min(1);
const responseBodySchema = z
  .array(z.object({ GroupNotificationID: z.string(), UsersInGroup: z.int().min(0) }))
  .or(z.object());

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

  public contentValidationService!: ContentValidationService;
  public cacheService!: CacheService;
  public groupStoreDynamoRepository!: GroupStoreDynamoRepository;

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

    const organisationID = event.requestContext.authorizer?.Organization as string | undefined;

    if (!organisationID) {
      throw new BadRequestError(['Organisation could be not be resolved from the client certificate.']);
    }

    const messages: IGroupMessage[] = event.body.map((body) => ({
      ...body,
      GroupNotificationID: body.GroupNotificationID ?? uuid(),
      OrganisationID: organisationID,
    }));

    // Retrieve the configuration of the number of workers to processes the group message
    // const workers = await this.config.getNumericParameter(NumericParameters.GroupProcessing.Workers);
    const workers = 5;

    // Pre-validate all messages & reject request when one of them contains unsupported url
    for (const message of messages) {
      this.contentValidationService.validate(message.MessageBody);
    }

    const response: Map<string, number> = new Map();
    await Promise.allSettled(
      messages.map(async (m) => {
        // Retrieve and store the PushIDs for the group in elasticache
        const pushIDs = await this.groupStoreDynamoRepository.getUsersInGroup(m.Namespace, m.Group, m.Subgroup);
        const pushIDBatches = splitIntoChunks(pushIDs, workers);

        // Splits PushIDs into chunks and assigns a group ingest key
        let numberOfUsers = 0;
        const messageToPublish = [];
        for (let i = 0; i < pushIDBatches.length; i++) {
          const cacheKey = `groupIngestion/${m.GroupNotificationID}/${i + 1}`;
          messageToPublish.push({ ...m, cacheKey });
          await this.cacheService.store(cacheKey, pushIDBatches[i]);
          numberOfUsers += pushIDBatches[i].length;
        }

        // Requeue message which passed validation and split into batches to the group processing queue
        this.observability.logger.info('Requeuing validated group message to process queue.', m.GroupNotificationID);
        response.set(m.GroupNotificationID, numberOfUsers);
      })
    );

    // Return placeholder status
    return {
      body: response
        ? Array.from(response, ([key, value]) => ({
            GroupNotificationID: key,
            UsersInGroup: value,
          }))
        : [],
      statusCode: 202,
    };
  }
}

export const handler = new PostGroupMessage(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  contentValidationService: iocGetContentValidationService(),
  cacheService: iocGetCacheService().connect(),
  groupStoreDynamoRepository: iocGetGroupStoreDynamoRepository(),
})).handler();
