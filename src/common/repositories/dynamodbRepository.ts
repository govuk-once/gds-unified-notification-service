import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { IDynamodbRepository } from '@common/repositories/interfaces/IDynamodbRepository';

export class DynamodbRepository implements IDynamodbRepository {
  private readonly client: DynamoDB;

  constructor(
    private tableName: string,
    protected logger: Logger,
    protected tracer: Tracer
  ) {
    const client = new DynamoDB({
      region: 'eu-west-2',
    });

    this.client = client;
    tracer.captureAWSv3Client(this.client);
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

  public async createRecordBatch<RecordType>(record: RecordType[]): Promise<void> {
    if (record.length === 0 || record.length > 25) {
      const errorMsg = 'To create batch records, array length must be more than 0 and at most 25.';
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
    this.logger.trace(`Creating ${record.length} records in table: ${this.tableName}`);

    const params = {
      RequestItems: {
        [this.tableName]: record.map((x) => ({
          PutRequest: {
            Item: marshall(x),
          },
        })),
      },
    };

    try {
      await this.client.batchWriteItem(params);
      this.logger.trace(`Successfully created records in table: ${this.tableName}`);
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
