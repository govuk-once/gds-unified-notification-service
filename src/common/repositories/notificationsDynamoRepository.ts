import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import {
  IMessageRecord,
  IMessageRecordSchema,
  IProcessedMessageRecord,
  IProcessedMessageRecordSchema,
} from '@common/repositories/interfaces';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils/parameters';
import { IAnalytics } from '@project/lambdas';

const recordSchema = IMessageRecordSchema;

export class NotificationsDynamoRepository extends DynamodbRepository<typeof recordSchema> {
  protected recordSchema = recordSchema;

  constructor(
    protected config: ConfigurationService,
    client: DynamoDB,
    protected observability: ObservabilityService
  ) {
    super(config, client, observability);
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

  public beforeCreate(record: IMessageRecord) {
    // Overrides before create function in dynamo repository using the IMessageRecord generic
    return {
      ...record,
      ...this.createExpirationDatePartial(record.RequestedDaysToExpire),
    };
  }
}
