import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { MessageRecord } from '@common/models/interfaces/MessageRecord';
import { StatusEnum } from '@common/models/StatusEnum';
import { IDynamoDbService } from '@common/services/interfaces/IDynamoDbService';

export class DyanmoDbService implements IDynamoDbService {
  private readonly tableName: string;
  private readonly client: DynamoDBClient;

  constructor(client: DynamoDBClient, tableName: string) {
    this.client = client;
    this.tableName = tableName;
  }

  public async createRecord(record: MessageRecord): Promise<void> {
    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: {
        id: { S: record.guid },
        Status: { S: record.status },
        CreatedAt: { S: record.createdAt },
      },
    });
    try {
      await this.client.send(command);
    } catch (error) {
      console.error('Failure in creating record: ', error);
    }
  }

  public async getRecord(guid: string): Promise<MessageRecord | null> {
    const command = new GetItemCommand({
      TableName: this.tableName,
      Key: {
        id: { S: guid },
      },
    });

    try {
      const response = await this.client.send(command);

      if (!response.Item) {
        return null;
      }

      const record: MessageRecord = {
        guid: response.Item?.Guid?.S || '',
        status: (response.Item?.Status?.S as StatusEnum) || StatusEnum.FAILED,
        createdAt: response.Item?.CreatedAt?.S || '',
      };

      return record;
    } catch (error) {
      console.error('Failure in getting record: ', error);
      return null;
    }
  }
}
