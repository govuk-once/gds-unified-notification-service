import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { MessageRecord } from '@common/models/interfaces/MessageRecord';
import { IStoreMessageRepository } from '@common/repositories/interfaces/IStoreMessageRepository';

export class StoreMessageRepository implements IStoreMessageRepository {
  private readonly tableName: string;
  private readonly client: DynamoDB;

  constructor(client: DynamoDB, tableName: string) {
    this.client = client;
    this.tableName = tableName;
  }

  public async createRecord(record: MessageRecord): Promise<void> {
    const params = {
      TableName: this.tableName,
      Item: marshall({
        id: record.guid,
        Status: record.status,
        CreatedAt: record.createdAt,
        Src: record.src,
      }),
    };
    try {
      await this.client.putItem(params);
    } catch (error) {
      console.error('Failure in creating record: ', error);
    }
  }

  public async getRecord(guid: string): Promise<MessageRecord | null> {
    const params = {
      TableName: this.tableName,
      Key: marshall({
        id: guid,
      }),
    };

    try {
      const { Item } = await this.client.getItem(params);

      if (!Item) {
        return null;
      }

      const response = unmarshall(Item) as MessageRecord;

      return response;
    } catch (error) {
      console.error('Failure in getting record: ', error);
      return null;
    }
  }
}
