import {
  APIHandler,
  ConfigurationService,
  ContentValidationService,
  GroupStoreDynamoRepository,
  HandlerDependencies,
  iocGetConfigurationService,
  iocGetContentValidationService,
  iocGetGroupStoreDynamoRepository,
  iocGetObservabilityService,
  ObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { BadRequestError } from '@common/models/Errors/BadRequestError';
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

export class PostGroupMessage extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'postGroupMessage';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public contentValidationService!: ContentValidationService;
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

    // Pre-validate all messages & reject request when one of them contains unsupported url
    for (const message of messages) {
      this.contentValidationService.validate(message.MessageBody);
    }

    const responses: { GroupNotificationID: string; UsersInGroup: number }[] = [];
    for (const message of messages) {
      const pushIds = await this.groupStoreDynamoRepository.getUsersInGroup(
        message.Namespace,
        message.Group,
        message.Subgroup
      );
      responses.push({ GroupNotificationID: message.GroupNotificationID, UsersInGroup: pushIds.length });
    }

    // Return placeholder status
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
  contentValidationService: iocGetContentValidationService(),
  groupStoreDynamoRepository: iocGetGroupStoreDynamoRepository(),
})).handler();
