import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { mTLSRevocationSchema } from '@common/repositories/interfaces/MTLSRevocationTable';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils/parameters';

export class MTLSRevocationDynamoRepository extends DynamodbRepository<typeof mTLSRevocationSchema> {
  protected recordSchema = mTLSRevocationSchema;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(config, observability);
  }

  async initialize() {
    await super.initialize(StringParameters.Table.MTLSRevocation.Attributes);
    return this;
  }
}
