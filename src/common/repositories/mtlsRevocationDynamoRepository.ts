import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { InMemoryTTLCache } from '@common/utils';
import { StringParameters } from '@common/utils/parameters';
import { MTLSRevocation } from '@project/lambdas/interfaces/MTLSRevocationTable';

export class MTLSRevocationDynamoRepository extends DynamodbRepository<MTLSRevocation> {
  private inMemoryCache = new InMemoryTTLCache<string, MTLSRevocation | null>(30000);
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(config, observability);
  }

  async initialize() {
    await super.initialize(
      StringParameters.Table.MTLSRevocation.KeyAttributes,
      StringParameters.Table.MTLSRevocation.Name
    );
    return this;
  }

  public async getRecord(keyValue: string): Promise<MTLSRevocation | null> {
    // Return cached entries
    if (this.inMemoryCache.has(keyValue)) {
      return this.inMemoryCache.get(keyValue)!;
    }

    // Fetch and populate cache
    const result = await super.getRecord(keyValue);
    this.inMemoryCache.set(keyValue, result);

    return result;
  }
}
