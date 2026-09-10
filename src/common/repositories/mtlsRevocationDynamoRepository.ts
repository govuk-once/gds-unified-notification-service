import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { mTLSRevocationRecordSchema } from '@common/repositories/interfaces';
import { ConfigurationService, ObservabilityService } from '@common/services';
import SSMParameters from '@shared/ssmParameter';

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
    await super.initialize(SSMParameters.Table.MTLSRevocation.Attributes);
    return this;
  }
}
