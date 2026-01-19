import { Logger } from '@aws-lambda-powertools/logger';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { iocGetLogger } from '@common/ioc';
import { IDynamodbRepository } from '@common/repositories/interfaces/IDynamodbRepository';

export class DynamodbRepository implements IDynamodbRepository {
  private readonly client: DynamoDB;
  public logger: Logger = iocGetLogger();

  constructor(private tableName: string) {
    const client = new DynamoDB({
      region: 'eu-west-2',
    });

    this.client = client;
  }

  public async createRecord<RecordType>(record: RecordType): Promise<void> {
    this.logger.trace(`Creating record in table: ${this.tableName}`);

    const params = {
      TableName: this.tableName,
      Item: marshall(record),
    };

    try {
      await this.client.putItem(params);
      this.logger.trace(`Successfully created record in table: ${this.tableName}`);
    } catch (error) {
      this.logger.error(`Failure in creating record table: ${this.tableName}. \nError: ${error}`);
    }
  }

  public async getRecord<RecordType>(key: string, value: string): Promise<RecordType | null> {
    this.logger.trace(`Retrieving record in table: ${this.tableName} with key: ${key}`);

    const params = {
      TableName: this.tableName,
      Key: marshall({
        [key]: value,
      }),
    };

    try {
      const { Item } = await this.client.getItem(params);

      if (!Item) {
        this.logger.trace(`No item in table: ${this.tableName} with key: ${key}`);
        return null;
      }

      const response = unmarshall(Item) as RecordType;

      this.logger.trace(`Retrieved record in table: ${this.tableName} with key: ${key}`);
      return response;
    } catch (error) {
      this.logger.error(`Failure in getting record: ${error}`);
      return null;
    }
  }
}
