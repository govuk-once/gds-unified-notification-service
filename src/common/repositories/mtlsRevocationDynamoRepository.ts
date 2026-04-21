import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils/parameters';
import { MTLSRevocation } from '@project/lambdas/interfaces/MTLSRevocationTable';

export class MTLSRevocationDynamoRepository extends DynamodbRepository<MTLSRevocation> {
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(config, observability);
  }

  async initialize() {
    await super.initialize(StringParameters.Table.MTLSRevocation.KeyAttributes);
    return this;
  }
}
