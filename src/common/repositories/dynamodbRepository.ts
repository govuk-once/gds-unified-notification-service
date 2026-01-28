import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import {
  BatchWriteItemCommandInput,
  DynamoDB,
  PutItemCommandInput,
  UpdateItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { IDynamodbRepository } from '@common/repositories/interfaces/IDynamodbRepository';

export abstract class DynamodbRepository<RecordType> implements IDynamodbRepository<RecordType> {
  private client: DynamoDB;
  protected tableName: string;
  protected tableKey: string;

  constructor(
    protected logger: Logger,
    protected metrics: Metrics,
    protected tracer: Tracer
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  public async initialize() {
    const client = new DynamoDB({
      region: 'eu-west-2',
    });

    this.client = client;
    this.tracer.captureAWSv3Client(this.client);
    return this;
  }

  public async createRecord<RecordType>(record: RecordType): Promise<void> {
    this.logger.info(`Creating record in table: ${this.tableName}`);

    try {
      const params: PutItemCommandInput = {
        TableName: this.tableName,
        Item: marshall(record, { removeUndefinedValues: true }),
      };

      await this.client.putItem(params);
      this.logger.info(`Successfully created record in table: ${this.tableName}`);
    } catch (error) {
      this.logger.error(`Failure in creating record table: ${this.tableName}. ${error}`);
    }
  }

  public async createRecordBatch<RecordType>(batchRecords: RecordType[]): Promise<void> {
    this.logger.info(`Creating ${batchRecords.length} records in table: ${this.tableName}`);

    try {
      if (batchRecords.length === 0) {
        this.logger.warn(`Triggered createRecordBatch with an empty array`);
        return;
      }
      if (batchRecords.length === 0 || batchRecords.length > 25) {
        const errorMsg = 'To create batch records, array length must be more than 0 and at most 25.';
        throw new Error(errorMsg);
      }

      const params: BatchWriteItemCommandInput = {
        RequestItems: {
          [this.tableName]: batchRecords.map((record) => ({
            PutRequest: {
              Item: marshall(record, { removeUndefinedValues: true }),
            },
          })),
        },
      };

      await this.client.batchWriteItem(params);
      this.logger.info(`Successfully created records in table: ${this.tableName}`);
    } catch (error) {
      this.logger.error(`Failure in creating records table: ${this.tableName}. ${error}`);
    }
  }

  public async updateRecord<RecordType extends object>(recordFields: RecordType): Promise<void> {
    this.logger.info(`Update record in table: ${this.tableName}, with key ${this.tableKey}`);

    try {
      const keyValue = recordFields[this.tableKey as keyof RecordType];
      if (!keyValue) {
        throw new Error(`No key value was found in table: ${this.tableName}, with key ${this.tableKey}`);
      }

      const entries = Object.entries(recordFields).filter(
        ([key, value]) => key !== this.tableKey && value != undefined
      );

      const updateExpression = 'set ' + entries.map(([key]) => `#${key} = :${key}`).join(', ');
      const expressionAttributeNames = Object.fromEntries(entries.map(([k]) => [`#${k}`, k]));
      const expressionAttributeValues = marshall(
        Object.fromEntries(entries.map(([key, value]) => [`:${key}`, value])),
        { removeUndefinedValues: true }
      );

      const params: UpdateItemCommandInput = {
        TableName: this.tableName,
        Key: marshall({
          [this.tableKey]: keyValue,
        }),
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        UpdateExpression: updateExpression,
      };

      await this.client.updateItem(params);
      this.logger.info(`Successfully updated record in table: ${this.tableName}`);
    } catch (error) {
      this.logger.error(`Failure in updating record table: ${this.tableName}. ${error}`);
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
      this.logger.error(`Failure in getting record for table: ${this.tableName}. ${error}`);
      return null;
    }
  }
}
