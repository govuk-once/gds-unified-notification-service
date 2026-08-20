import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { mTLSRevocationRecordSchema } from '@common/repositories/interfaces/MTLSRevocationTable';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils/parameters';

export class MTLSRevocationDynamoRepository extends DynamodbRepository<typeof mTLSRevocationRecordSchema> {
  protected recordSchema = mTLSRevocationRecordSchema;

  constructor(
    protected config: ConfigurationService,
    client: DynamoDB,
    protected observability: ObservabilityService
  ) {
    super(config, client, observability);
  }

  async initialize() {
    await super.initialize(StringParameters.Table.MTLSRevocation.Attributes);
    return this;
  }
}
