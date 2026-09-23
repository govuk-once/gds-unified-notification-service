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
      this.observability.logger.debug('pushID has not been provided - returning 400');
      throw new BadRequestError(['pushID has not been provided']);
    }

    // Get users current groups
    let usersGroups = await this.groupStoreDynamoRepository.getUsersGroups(pushID);

    // Leave groups
    const groupsToLeave = event.body.filter((g) => g.Action === GroupActionEnum.LEAVE);
    this.observability.logger.debug('Leaving groups', {
      pushID,
      groupsToLeave,
    });
    usersGroups = await this.groupStoreDynamoRepository.leaveGroups(pushID, groupsToLeave, usersGroups);

    // Join Groups
    const groupsToJoin = event.body.filter((g) => g.Action === GroupActionEnum.JOIN);
    this.observability.logger.debug('Joining groups', {
      pushID,
      groupsToJoin,
    });
    usersGroups = await this.groupStoreDynamoRepository.joinGroups(pushID, groupsToJoin, usersGroups);

    this.observability.logger.debug('Successful request - returning 200', {
      pushID,
    });
    return {
      body: usersGroups.map((g) => {
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
