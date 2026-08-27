import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { IDynamoAttributes, IDynamoAttributesSchema } from '@common/repositories/interfaces';
import {
  IMessageRecord,
  IMessageRecordSchema,
  IProcessedMessageRecord,
  IProcessedMessageRecordSchema,
} from '@common/repositories/interfaces/IMessageRecord';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils/parameters';
import { IAnalytics } from '@project/lambdas/interfaces/IAnalyticsSchema';

const recordSchema = IMessageRecordSchema;

export class NotificationsDynamoRepository extends DynamodbRepository<typeof recordSchema> {
  protected recordSchema = recordSchema;

  constructor(
    protected readonly config: ConfigurationService,
    protected readonly observability: ObservabilityService,
    protected readonly client: DynamoDB,
    protected readonly tableAttributes: IDynamoAttributes
  ) {
    super(config, observability, client, tableAttributes);
  }

  static async create(config: ConfigurationService, observability: ObservabilityService) {
    return new NotificationsDynamoRepository(
      config,
      observability,
      new DynamoDB({
        region: 'eu-west-2',
      }),
      await config.getParameterAsType(StringParameters.Table.Inbound.Attributes, IDynamoAttributesSchema)
    );
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
