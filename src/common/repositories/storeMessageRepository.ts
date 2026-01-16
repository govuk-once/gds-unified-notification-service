import { Logger } from '@aws-lambda-powertools/logger';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { iocGetLogger } from '@common/ioc';
import { IStoreMessageRepository } from '@common/repositories/interfaces/IStoreMessageRepository';

export class StoreMessageRepository implements IStoreMessageRepository {
  private readonly tableName: string;
  private readonly client: DynamoDB;
  public logger: Logger = iocGetLogger();

  constructor(tableName: string) {
    const client = new DynamoDB({
      region: 'eu-west-2',
    });

    this.client = client;
    this.tableName = tableName;
  }

  public async createRecord<RecordType>(record: RecordType): Promise<void> {
    const params = {
      TableName: this.tableName,
      Item: marshall(record),
    };
    try {
      await this.client.putItem(params);
    } catch (error) {
      this.logger.error(`Failure in creating record: ${error}`);
    }
  }

  public async getRecord<RecordType>(key: string, value: string): Promise<RecordType | null> {
    const params = {
      TableName: this.tableName,
      Key: marshall({
        [key]: value,
      }),
    };

    try {
      const { Item } = await this.client.getItem(params);

      if (!Item) {
        return null;
      }

      const response = unmarshall(Item) as RecordType;

      return response;
    } catch (error) {
      this.logger.error(`Failure in getting record: ${error}`);
      return null;
    }
  }
}
