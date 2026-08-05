import {
  GroupStoreDynamoRepository,
  HandlerDependencies,
  iocGetConfigurationService,
  iocGetGroupStoreDynamoRepository,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { BadRequestError } from '@common/models/Errors/BadRequestError';
import { FlexAPIHandler } from '@common/operations/flexApiHandler';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { GroupActionEnum, IModifyGroupsSchema } from '@project/lambdas/interfaces';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.array(IModifyGroupsSchema);
const responseBodySchema = z.any();

export class ModifyGroups extends FlexAPIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'modifyGroups';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public groupStoreDynamoRepository!: GroupStoreDynamoRepository;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<ModifyGroups>
  ) {
    super(config, observability);
    this.injectDependencies(asyncDependencies);
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    this.observability.logger.debug('Received request', {
      pushID: event.queryStringParameters?.pushID,
      requestId: context.awsRequestId,
      groups: event.body,
    });

    // Validate
    const pushID = event.queryStringParameters?.pushID;
    if (!pushID) {
      this.observability.logger.debug('PushID has not been provided - returning 400');
      throw new BadRequestError(['PushID has not been provided']);
    }

    // Leave groups
    await this.groupStoreDynamoRepository.leaveGroups(
      pushID,
      event.body.filter((g) => g.Action === GroupActionEnum.LEAVE)
    );

    // Join Groups
    await this.groupStoreDynamoRepository.joinGroups(
      pushID,
      event.body.filter((g) => g.Action === GroupActionEnum.JOIN)
    );

    // Get users groups to return
    const groups = await this.groupStoreDynamoRepository.getUsersGroups(pushID);

    this.observability.logger.debug('Successful request - returning 200', {
      pushID,
    });

    return {
      body: groups.map((g) => {
        return {
          Namespace: g.Namespace,
          Group: g.Group,
          Subgroup: g.Subgroup,
        };
      }),
      statusCode: 200,
    };
  }
}

export const handler = new ModifyGroups(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  groupStoreDynamoRepository: iocGetGroupStoreDynamoRepository(),
})).handler();
