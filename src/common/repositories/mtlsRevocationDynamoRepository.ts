import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { IDynamoAttributes, IDynamoAttributesSchema } from '@common/repositories/interfaces';
import { mTLSRevocationRecordSchema } from '@common/repositories/interfaces/MTLSRevocationTable';
import { ConfigurationService, ObservabilityService } from '@common/services';
import SSMParameters from '@shared/ssmParameter';

export class MTLSRevocationDynamoRepository extends DynamodbRepository<typeof mTLSRevocationRecordSchema> {
  protected recordSchema = mTLSRevocationRecordSchema;

  constructor(
    protected readonly config: ConfigurationService,
    protected readonly observability: ObservabilityService,
    protected readonly client: DynamoDB,
    protected readonly tableAttributes: IDynamoAttributes
  ) {
    super(config, observability, client, tableAttributes);
  }

  static async create(config: ConfigurationService, observability: ObservabilityService, client: DynamoDB) {
    return new MTLSRevocationDynamoRepository(
      config,
      observability,
      client,
      await config.getParameter(SSMParameters.Table.MTLSRevocation.Attributes, IDynamoAttributesSchema)
    );
  }
}
