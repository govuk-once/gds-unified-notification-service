import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import {
  BatchWriteItemCommandInput,
  DynamoDB,
  PutItemCommandInput,
  UpdateItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { IDynamodbRepository } from '@common/repositories/interfaces/IDynamodbRepository';

export class DynamodbRepository implements IDynamodbRepository {
  private readonly client: DynamoDB;
  constructor(
    private tableName: string,
    private tableKey: string,
    private logger: Logger,
    private tracer: Tracer
  ) {
    const client = new DynamoDB({
      region: 'eu-west-2',
    });

    this.client = client;
    tracer.captureAWSv3Client(this.client);
  }

  public async createRecord<RecordType>(record: RecordType): Promise<void> {
    this.logger.info(`Creating record in table: ${this.tableName}`);

    record = this.removeUndefinedValuesFromObject(record);
    const params: PutItemCommandInput = {
      TableName: this.tableName,
      Item: marshall(record),
    };

    try {
      await this.client.putItem(params);
      this.logger.info(`Successfully created record in table: ${this.tableName}`);
    } catch (error) {
      this.logger.error(`Failure in creating record table: ${this.tableName}. \nError: ${error}`);
    }
  }

  public async createRecordBatch<RecordType>(batchRecords: RecordType[]): Promise<void> {
    if (batchRecords.length === 0 || batchRecords.length > 25) {
      const errorMsg = 'To create batch records, array length must be more than 0 and at most 25.';
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
    this.logger.info(`Creating ${batchRecords.length} records in table: ${this.tableName}`);

    batchRecords.map((record) => this.removeUndefinedValuesFromObject(record));
    const params: BatchWriteItemCommandInput = {
      RequestItems: {
        [this.tableName]: batchRecords.map((record) => ({
          PutRequest: {
            Item: marshall(record),
          },
        })),
      },
    };

    try {
      await this.client.batchWriteItem(params);
      this.logger.info(`Successfully created records in table: ${this.tableName}`);
    } catch (error) {
      this.logger.error(`Failure in creating record table: ${this.tableName}. \nError: ${error}`);
    }
  }

  public async updateRecord<RecordType extends object>(keyValue: string, record: RecordType): Promise<void> {
    this.logger.info(`Update record in table: ${this.tableName}, with key ${this.tableKey}`);

    const entries = Object.entries(record);
    const updateExpression = 'set ' + entries.map(([k], i) => `${k} = :v${i}`).join(', ');

    const params: UpdateItemCommandInput = {
      TableName: this.tableName,
      Key: marshall({
        [this.tableKey]: keyValue,
      }),
      //ConditionExpression: `attribute_exists(${this.tableKey})`,
      ExpressionAttributeValues: marshall(record),
      UpdateExpression: updateExpression,
    };

    try {
      await this.client.updateItem(params);
      this.logger.info(`Successfully created records in table: ${this.tableName}`);
    } catch (error) {
      this.logger.error(`Failure in creating record table: ${this.tableName}. \nError: ${error}`);
    }
  }

  public async getRecord<RecordType>(keyValue: string): Promise<RecordType | null> {
    this.logger.info(`Retrieving record in table: ${this.tableName} with key: ${this.tableKey}`);

    const params = {
      TableName: this.tableName,
      Key: marshall({
        [this.tableKey]: keyValue,
      }),
    };

    try {
      const { Item } = await this.client.getItem(params);

      if (!Item) {
        this.logger.info(`No item in table: ${this.tableName} with key: ${this.tableKey}`);
        return null;
      }

      const response = unmarshall(Item) as RecordType;

      this.logger.info(`Retrieved record in table: ${this.tableName} with key: ${this.tableKey}`);
      return response;
    } catch (error) {
      this.logger.error(`Failure in getting record: ${error}`);
      return null;
    }
  }

  private removeUndefinedValuesFromObject<RecordType>(record: RecordType): RecordType {
    for (const key in record) {
      if (record[key as keyof RecordType] === undefined) {
        delete record[key as keyof RecordType];
      }
    }

    return record;
  }
}
