import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils/parameters';
import { IFlexNotification } from '@project/lambdas/interfaces/IFlexNotification';

export class FlexDynamoRepository extends DynamodbRepository<IFlexNotification> {
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(config, observability);
  }

  async initialize() {
    await super.initialize(
      StringParameters.Table.FlexNotification.KeyAttributes,
      StringParameters.Table.FlexNotification.Name
    );
    return this;
  }
}
