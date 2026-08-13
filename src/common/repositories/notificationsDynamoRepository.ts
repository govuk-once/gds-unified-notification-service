import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import {
  IMessageRecord,
  IProcessedMessageRecord,
  IProcessedMessageRecordSchema,
} from '@common/repositories/interfaces/IMessageRecord';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils/parameters';
import { IAnalytics } from '@project/lambdas/interfaces/IAnalyticsSchema';

export class NotificationsDynamoRepository extends DynamodbRepository<IMessageRecord> {
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(config, observability);
  }

  async initialize() {
    await super.initialize(StringParameters.Table.Inbound.Attributes);
    return this;
  }

  public async addEvent(event: IAnalytics) {
    return await this.appendToList(event.NotificationID, 'Events', [event]);
  }

  public async getProcessedMessageByID(NotificationID: string): Promise<IProcessedMessageRecord | undefined> {
    this.observability.logger.debug(
      'Retrieving message by notificationID and validating it has been processed',
      NotificationID
    );
    const messageRecords = await this.getRecord(NotificationID);

    this.observability.logger.debug('Parsing all message records against processed message schema');
    const { data } = IProcessedMessageRecordSchema.safeParse(messageRecords);

    return data;
  }

  public async getProcessedMessages(externalUserID: string): Promise<IProcessedMessageRecord[]> {
    this.observability.logger.debug('Retrieving all messages that have been processed for user');
    const messageRecords = await this.getRecordsQuery(
      {
        field: 'ExternalUserID',
        value: externalUserID,
      },
      'ExternalUserIDIndex'
    );

    this.observability.logger.debug('Parsing all message records against processed message schema');
    const { data } = IProcessedMessageRecordSchema.array().safeParse(messageRecords);

    return data ?? [];
  }
}
