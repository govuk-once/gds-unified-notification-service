import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { ConfigurationService } from '@common/services';
import { StringParameters } from '@common/utils/parameters';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';

export class EventsDynamoRepository extends DynamodbRepository<IMessageRecord> {
  constructor(
    protected config: ConfigurationService,
    protected logger: Logger,
    protected metrics: Metrics,
    protected tracer: Tracer
  ) {
    super(logger, metrics, tracer);
  }

  async initialize() {
    this.tableName = await this.config.getParameter(StringParameters.Table.Events.Name);
    this.tableKey = await this.config.getParameter(StringParameters.Table.Events.Key);
    await super.initialize();
    return this;
  }
}
