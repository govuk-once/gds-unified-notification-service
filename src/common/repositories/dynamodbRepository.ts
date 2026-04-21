import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  ConsumedCapacity,
  DeleteItemCommandInput,
  DynamoDB,
  ReturnConsumedCapacity,
  ScanCommandInput,
  UpdateItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { IDynamodbRepository } from '@common/repositories/interfaces/IDynamodbRepository';
import { IDynamoAttributes, IDynamoAttributesSchema } from '@common/repositories/interfaces/IDynamoKeys';
import { ConfigurationService, ObservabilityService } from '@common/services';

export abstract class DynamodbRepository<RecordType extends object> implements IDynamodbRepository<RecordType> {
  private client: DynamoDB;
  protected attributes: IDynamoAttributes;
  protected tableName: string;
  protected tableKey: string;

  protected expirationDurationInSeconds: number | undefined;
  protected expirationAttribute: string | undefined;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {}

  public async initialize(tableAttributesParameter: string) {
    this.attributes = await this.config.getParameterAsType(tableAttributesParameter, IDynamoAttributesSchema);
    this.tableName = this.attributes.tableName;
    this.tableKey = this.attributes.hashKey;
    this.expirationAttribute = this.attributes.expirationAttribute;
    this.expirationDurationInSeconds = this.attributes.expirationDurationInSeconds;

    const client = new DynamoDB({
      region: 'eu-west-2',
    });

    this.client = client;
    this.observability.tracer.captureAWSv3Client(this.client);
    return this;
  }

  public async observeCapacity<
    ObservableDynamoDBPromise extends { ConsumedCapacity?: ConsumedCapacity | ConsumedCapacity[] },
  >(label: string, promise: Promise<ObservableDynamoDBPromise>): Promise<ObservableDynamoDBPromise> {
    const result = await promise;
    if (result.ConsumedCapacity) {
      for (const consumedCapacity of Array.isArray(result.ConsumedCapacity)
        ? result.ConsumedCapacity
        : [result.ConsumedCapacity]) {
        const rcu = consumedCapacity.ReadCapacityUnits ?? 0;
        const wcu = consumedCapacity.WriteCapacityUnits ?? 0;
        const gsi = consumedCapacity.GlobalSecondaryIndexes ?? {};
        const lsi = consumedCapacity.LocalSecondaryIndexes ?? {};
        const table = consumedCapacity.TableName ?? {};

        this.observability.metrics.addMetric(`DYNAMODB_CONSUMED_READ_CAPACITY_UNITS`, MetricUnit.Count, rcu);
        this.observability.metrics.addMetric(`DYNAMODB_CONSUMED_WRITE_CAPACITY_UNITS`, MetricUnit.Count, wcu);
        this.observability.logger.info(`Dynamodb Usage`, { label, table, rcu, wcu, gsi, lsi });
      }
    }
    return result;
  }

  public async createRecord(record: RecordType): Promise<void> {
    this.observability.logger.info(`Creating record in table: ${this.tableName}`);

    try {
      await this.observeCapacity(
        `createRecord`,
        this.client.putItem({
          TableName: this.tableName,
          Item: marshall(this.beforeCreate(record), { removeUndefinedValues: true }),
          ReturnConsumedCapacity: ReturnConsumedCapacity.TOTAL,
        })
      );
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

      await this.observeCapacity(
        `createRecordBatch`,
        this.client.batchWriteItem({
          RequestItems: {
            [this.tableName]: batchRecords.map((record) => ({
              PutRequest: {
                Item: marshall(this.beforeCreate(record), { removeUndefinedValues: true }),
              },
            })),
          },
          ReturnConsumedCapacity: ReturnConsumedCapacity.TOTAL,
        })
      );

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

    const attributes = Array.from(
      new Set([this.attributes.hashKey, this.attributes.rangeKey, ...this.attributes.attributes])
    );

    // TODO: This needs a better solution
    // Filter out known keys from payloads - as dynamodb updates cannot be updating those fields
    const entries = Object.entries(this.beforeUpdate(recordFields)).filter(
      ([key, value]) => attributes.includes(key) == false && value != undefined
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
      ReturnConsumedCapacity: ReturnConsumedCapacity.TOTAL,
    };

    try {
      await this.observeCapacity(`updateRecord`, this.client.updateItem(params));
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
      ReturnConsumedCapacity: ReturnConsumedCapacity.TOTAL,
    };

    try {
      await this.observeCapacity(`deleteRecord`, this.client.deleteItem(params));
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

  // Generates expiration field that can be injected as partial into create/update calls
  // When expirationAttribute is not set, or expirationDurationInSeconds is 0 - empty object is returned instead
  protected createExpirationDatePartial(): Partial<RecordType> {
    return this.expirationAttribute && this.expirationDurationInSeconds && this.expirationDurationInSeconds > 0
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
