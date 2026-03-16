import {
  BatchWriteItemCommandInput,
  DeleteItemCommandInput,
  DynamoDB,
  PutItemCommandInput,
  ScanCommandInput,
  UpdateItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { IDynamodbRepository } from '@common/repositories/interfaces/IDynamodbRepository';
import { IDynamoKeyAttributes, IDynamoKeyAttributesSchema } from '@common/repositories/interfaces/IDynamoKeys';
import { ConfigurationService, ObservabilityService } from '@common/services';

export abstract class DynamodbRepository<RecordType extends object> implements IDynamodbRepository<RecordType> {
  private client: DynamoDB;
  protected keyAttributes: IDynamoKeyAttributes;
  protected tableName: string;
  protected tableKey: string;

  protected expirationDurationInSeconds: number = 0;
  protected expirationAttribute: string | null = null;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {}

  public async initialize(tableAttributesParameter: string, tableNameParameter: string) {
    this.tableName = await this.config.getParameter(tableNameParameter);
    this.keyAttributes = await this.config.getParameterAsType(tableAttributesParameter, IDynamoKeyAttributesSchema);
    this.tableKey = this.keyAttributes.hashKey;

    const client = new DynamoDB({
      region: 'eu-west-2',
    });

    this.client = client;
    this.observability.tracer.captureAWSv3Client(this.client);
    return this;
  }

  public async createRecord(record: RecordType): Promise<void> {
    this.observability.logger.info(`Creating record in table: ${this.tableName}`);

    try {
      const params: PutItemCommandInput = {
        TableName: this.tableName,
        Item: marshall(this.beforeCreate(record), { removeUndefinedValues: true }),
      };

      await this.client.putItem(params);
      this.observability.logger.info(`Successfully created record in table: ${this.tableName}`);
    } catch (error) {
      this.observability.logger.error(`Failure in creating record table: ${this.tableName}. ${error}`);
    }
  }

  public async createRecordBatch(batchRecords: RecordType[]): Promise<void> {
    this.observability.logger.info(`Creating ${batchRecords.length} records in table: ${this.tableName}`);

    try {
      if (batchRecords.length === 0) {
        this.observability.logger.warn(`Triggered createRecordBatch with an empty array`);
        return;
      }
      if (batchRecords.length > 25) {
        throw new Error('To create batch records, array length must be no greater than 25.');
      }

      const params: BatchWriteItemCommandInput = {
        RequestItems: {
          [this.tableName]: batchRecords.map((record) => ({
            PutRequest: {
              Item: marshall(this.beforeCreate(record), { removeUndefinedValues: true }),
            },
          })),
        },
      };

      await this.client.batchWriteItem(params);
      this.observability.logger.info(`Successfully created records in table: ${this.tableName}`);
    } catch (error) {
      this.observability.logger.error(`Failure in creating records table: ${this.tableName}. ${error}`);
    }
  }

  public async updateRecord(
    recordFields: Partial<RecordType>,
    options?: { resetExpirationDate: boolean }
  ): Promise<void> {
    this.observability.logger.info(`Update record in table: ${this.tableName}, with key ${this.tableKey}`);

    const keyValue = recordFields[this.tableKey as keyof RecordType];
    if (!keyValue) {
      throw new Error(`No key value was found in table: ${this.tableName}, with key ${this.tableKey}`);
    }

    const keyAttributes = Array.from(
      new Set([this.keyAttributes.hashKey, this.keyAttributes.rangeKey, ...this.keyAttributes.attributes])
    );

    // TODO: This needs a better solution
    // Filter out known keys from payloads - as dynamodb updates cannot be updating those fields
    const entries = Object.entries(this.beforeUpdate(recordFields)).filter(
      ([key, value]) => keyAttributes.includes(key) == false && value != undefined
    );

    const updateExpression = 'set ' + entries.map(([key]) => `#${key} = :${key}`).join(', ');
    const expressionAttributeNames = Object.fromEntries(entries.map(([k]) => [`#${k}`, k]));
    const expressionAttributeValues = marshall(Object.fromEntries(entries.map(([key, value]) => [`:${key}`, value])), {
      removeUndefinedValues: true,
    });

    const params: UpdateItemCommandInput = {
      TableName: this.tableName,
      Key: marshall({
        [this.tableKey]: keyValue,
      }),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      UpdateExpression: updateExpression,
    };

    try {
      await this.client.updateItem(params);
      this.observability.logger.info(`Successfully updated record in table: ${this.tableName}`, {
        params,
        entries,
        recordFields,
      });
    } catch (error) {
      this.observability.logger.error(`Failure in updating record table: ${this.tableName}. ${error}`, {
        error,
        params,
        entries,
        recordFields,
      });
    }
  }

  public async appendToList<T>(keyValue: string, listKey: string, item: T) {
    const params: UpdateItemCommandInput = {
      TableName: this.tableName,
      Key: marshall({
        [this.tableKey]: keyValue,
      }),
      UpdateExpression: 'SET #attr = list_append(#attr, :value)',
      ExpressionAttributeNames: { '#attr': listKey },
      ExpressionAttributeValues: marshall({ ':value': item }),
    };

    try {
      await this.client.updateItem(params);
      this.observability.logger.info(`Successfully updated record in table: ${this.tableName}`, {
        params,
        listKey,
        item,
      });
    } catch (error) {
      this.observability.logger.error(`Failure in updating record table: ${this.tableName}. ${error}`, {
        error,
        params,
        listKey,
        item,
      });
    }
  }

  public async getRecord(keyValue: string): Promise<RecordType | null> {
    this.observability.logger.info(`Retrieving record in table: ${this.tableName} with key: ${this.tableKey}`);

    const params = {
      TableName: this.tableName,
      Key: marshall({
        [this.tableKey]: keyValue,
      }),
    };

    try {
      const { Item } = await this.client.getItem(params);

      if (!Item) {
        this.observability.logger.info(`No item in table: ${this.tableName} with key: ${this.tableKey}`);
        return null;
      }

      const response = unmarshall(Item) as RecordType;

      this.observability.logger.info(`Retrieved record in table: ${this.tableName} with key: ${this.tableKey}`);
      return response;
    } catch (error) {
      this.observability.logger.error(`Failure in getting record for table: ${this.tableName}. ${error}`);
      return null;
    }
  }

  public async deleteRecord(keyValue: string): Promise<void> {
    this.observability.logger.error(`Deleting record in table: ${this.tableName} with key ${this.tableKey}`);
    const params: DeleteItemCommandInput = {
      TableName: this.tableName,
      Key: marshall({
        [this.tableKey]: keyValue,
      }),
    };

    try {
      await this.client.deleteItem(params);
      this.observability.logger.error(
        `Successfully deleted record in table: ${this.tableName} with key ${this.tableKey}`
      );
    } catch (error) {
      this.observability.logger.error(
        `Failure in deleting record in table: ${this.tableName} with key ${this.tableKey}`
      );
    }
  }

  public async getRecords<RecordType>(
    filter?: { field: string; value: string },
    indexName?: string
  ): Promise<RecordType[]> {
    const params: ScanCommandInput = {
      TableName: this.tableName,
      ...(filter && {
        FilterExpression: '#filterField = :filterValue',
        ExpressionAttributeNames: { '#filterField': filter.field },
        ExpressionAttributeValues: marshall({ ':filterValue': filter.value }),
        IndexName: indexName,
      }),
    };

    try {
      const { Items } = await this.client.scan(params);
      if (!Items || Items.length === 0) {
        return [];
      }
      return Items.map((item) => unmarshall(item) as RecordType);
    } catch (error) {
      this.observability.logger.error(`Failure in getting records for table ${this.tableName}. ${error}`);
      return [];
    }
  }

  //
  protected createExpirationDatePartial(): Partial<RecordType> {
    return this.expirationAttribute !== null && this.expirationDurationInSeconds > 0
      ? ({
          [this.expirationAttribute]: new Date(
            new Date().getTime() + this.expirationDurationInSeconds * 1000
          ).toISOString(),
        } as Partial<RecordType>)
      : {};
  }

  // Allows overwriting logic before triggers
  public beforeCreate(record: RecordType) {
    return {
      ...record,
      // Dynamically inject expiration date if table calls for it
      ...this.createExpirationDatePartial(),
    } as RecordType;
  }

  public beforeUpdate(partial: Partial<RecordType>, options?: { resetExpirationDate: boolean }) {
    return {
      ...partial,
      // Inject expiration date property dynamically during updates if relevant option has been set
      ...(options?.resetExpirationDate ? this.createExpirationDatePartial() : {}),
    };
  }
}
