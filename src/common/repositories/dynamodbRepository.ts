import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  AttributeValue,
  ConditionalCheckFailedException,
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
import { ConfigurationService, MetricsLabels, ObservabilityService } from '@common/services';

export abstract class DynamodbRepository<RecordType extends object> implements IDynamodbRepository<RecordType> {
  private client: DynamoDB;
  protected tableAttributes: IDynamoAttributes;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {}

  public async initialize(tableAttributesParameter: string) {
    this.tableAttributes = await this.config.getParameterAsType(tableAttributesParameter, IDynamoAttributesSchema);

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

        this.observability.metrics.addMetric(
          MetricsLabels.DYNAMODB_CONSUMED_READ_CAPACITY_UNITS,
          MetricUnit.Count,
          rcu
        );
        this.observability.metrics.addMetric(
          MetricsLabels.DYNAMODB_CONSUMED_WRITE_CAPACITY_UNITS,
          MetricUnit.Count,
          wcu
        );
        this.observability.logger.info(`Dynamodb Usage`, { label, table, rcu, wcu, gsi, lsi });
      }
    }
    return result;
  }

  public async createRecord(record: RecordType): Promise<void> {
    this.observability.logger.info(`Creating record in table: ${this.tableAttributes.name}`);

    try {
      await this.observeCapacity(
        this.createRecord.name,
        this.client.putItem({
          TableName: this.tableAttributes.name,
          Item: marshall(this.beforeCreate(record), { removeUndefinedValues: true }),
          ReturnConsumedCapacity: ReturnConsumedCapacity.TOTAL,
        })
      );
      this.observability.logger.info(`Successfully created record in table: ${this.tableAttributes.name}`);
    } catch (error) {
      this.observability.logger.error(`Failure in creating record table: ${this.tableAttributes.name}. ${error}`);
    }
  }

  public async createRecordBatch(batchRecords: RecordType[]): Promise<void> {
    this.observability.logger.info(`Creating ${batchRecords.length} records in table: ${this.tableAttributes.name}`);

    try {
      if (batchRecords.length === 0) {
        this.observability.logger.warn(`Triggered createRecordBatch with an empty array`);
        return;
      }
      if (batchRecords.length > 25) {
        throw new Error('To create batch records, array length must be no greater than 25.');
      }

      await this.observeCapacity(
        this.createRecordBatch.name,
        this.client.batchWriteItem({
          RequestItems: {
            [this.tableAttributes.name]: batchRecords.map((record) => ({
              PutRequest: {
                Item: marshall(this.beforeCreate(record), { removeUndefinedValues: true }),
              },
            })),
          },
          ReturnConsumedCapacity: ReturnConsumedCapacity.TOTAL,
        })
      );

      this.observability.logger.info(`Successfully created records in table: ${this.tableAttributes.name}`);
    } catch (error) {
      this.observability.logger.error(`Failure in creating records table: ${this.tableAttributes.name}. ${error}`);
    }
  }

  public async updateRecord(
    recordFields: Partial<RecordType>,
    options?: { resetExpirationDate: boolean }
  ): Promise<void> {
    this.observability.logger.info(
      `Update record in table: ${this.tableAttributes.name}, with key ${this.tableAttributes.hashKey}`
    );

    const keyValue = recordFields[this.tableAttributes.hashKey as keyof RecordType];
    if (!keyValue) {
      throw new Error(
        `No key value was found in table: ${this.tableAttributes.name}, with key ${this.tableAttributes.hashKey}`
      );
    }

    const attributes = Array.from(
      new Set([this.tableAttributes.hashKey, this.tableAttributes.rangeKey, ...this.tableAttributes.attributes])
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
      TableName: this.tableAttributes.name,
      Key: marshall({
        [this.tableAttributes.hashKey]: keyValue,
      }),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      UpdateExpression: updateExpression,
      ReturnConsumedCapacity: ReturnConsumedCapacity.TOTAL,
    };

    try {
      await this.observeCapacity(this.updateRecord.name, this.client.updateItem(params));
      this.observability.logger.info(`Successfully updated record in table: ${this.tableAttributes.name}`, {
        params,
        entries,
        recordFields,
      });
    } catch (error) {
      this.observability.logger.error(`Failure in updating record table: ${this.tableAttributes.name}. ${error}`, {
        error,
        params,
        entries,
        recordFields,
      });
    }
  }

  public async appendToList<T>(keyValue: string, listKey: string, item: T) {
    const params: UpdateItemCommandInput = {
      TableName: this.tableAttributes.name,
      Key: marshall({
        [this.tableAttributes.hashKey]: keyValue,
      }),
      UpdateExpression: 'SET #attr = list_append(#attr, :value)',
      ExpressionAttributeNames: { '#attr': listKey },
      ExpressionAttributeValues: marshall({ ':value': item }),
    };

    try {
      await this.observeCapacity(this.appendToList.name, this.client.updateItem(params));
      this.observability.logger.info(`Successfully updated record in table: ${this.tableAttributes.name}`, {
        params,
        listKey,
        item,
      });
    } catch (error) {
      this.observability.logger.error(`Failure in updating record table: ${this.tableAttributes.name}. ${error}`, {
        error,
        params,
        listKey,
        item,
      });
    }
  }

  public async getRecord(keyValue: string): Promise<RecordType | null> {
    this.observability.logger.info(
      `Retrieving record in table: ${this.tableAttributes.name} with key: ${this.tableAttributes.hashKey}`
    );

    const params = {
      TableName: this.tableAttributes.name,
      Key: marshall({
        [this.tableAttributes.hashKey]: keyValue,
      }),
    };

    try {
      const { Item } = await this.client.getItem(params);

      if (!Item) {
        this.observability.logger.info(
          `No item in table: ${this.tableAttributes.name} with key: ${this.tableAttributes.hashKey}`
        );
        return null;
      }

      const response = unmarshall(Item) as RecordType;

      this.observability.logger.info(
        `Retrieved record in table: ${this.tableAttributes.name} with key: ${this.tableAttributes.hashKey}`
      );
      return response;
    } catch (error) {
      this.observability.logger.error(`Failure in getting record for table: ${this.tableAttributes.name}. ${error}`);
      return null;
    }
  }

  public async deleteRecord(keyValue: string): Promise<void> {
    this.observability.logger.error(
      `Deleting record in table: ${this.tableAttributes.name} with key ${this.tableAttributes.hashKey}`
    );
    const params: DeleteItemCommandInput = {
      TableName: this.tableAttributes.name,
      Key: marshall({
        [this.tableAttributes.hashKey]: keyValue,
      }),
      ReturnConsumedCapacity: ReturnConsumedCapacity.TOTAL,
    };

    try {
      await this.observeCapacity(this.deleteRecord.name, this.client.deleteItem(params));
      this.observability.logger.error(
        `Successfully deleted record in table: ${this.tableAttributes.name} with key ${this.tableAttributes.hashKey}`
      );
    } catch {
      this.observability.logger.error(
        `Failure in deleting record in table: ${this.tableAttributes.name} with key ${this.tableAttributes.hashKey}`
      );
    }
  }

  public async getRecords<RecordType>(
    filter?: { field: string; value: string },
    indexName?: string
  ): Promise<RecordType[]> {
    const params: ScanCommandInput = {
      TableName: this.tableAttributes.name,
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
      this.observability.logger.error(`Failure in getting records for table ${this.tableAttributes.name}. ${error}`);
      return [];
    }
  }

  public async incrementRecord(record: RecordType, counter: string): Promise<void> {
    this.observability.logger.info(`Incrementing record in table: ${this.tableAttributes.name}`);

    try {
      const keyValue = record[this.tableAttributes.hashKey as keyof RecordType];
      if (!keyValue) {
        throw new Error(
          `No key value was found in table: ${this.tableAttributes.name}, with key ${this.tableAttributes.hashKey}`
        );
      }

      // Will increment the item if the key exists, or create an item with value 1 if not
      const updateExpression = `set #counter = if_not_exists(#counter, :start_value) + :incr`;

      const expressionAttributeNames = { '#counter': counter };
      const expressionAttributeValues = {
        ':incr': { N: '1' },
        ':start_value': { N: '0' },
      };

      const params: UpdateItemCommandInput = {
        TableName: this.tableAttributes.name,
        Key: marshall({
          [this.tableAttributes.hashKey]: keyValue,
        }),
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        UpdateExpression: updateExpression,
        ReturnConsumedCapacity: ReturnConsumedCapacity.TOTAL,
      };

      await this.observeCapacity(this.incrementRecord.name, this.client.updateItem(params));
    } catch (error) {
      this.observability.logger.error(
        `Failure in adding record or incrementing in table: ${this.tableAttributes.name}`,
        { error }
      );
    }
  }

  // Generates expiration field that can be injected as partial into create/update calls
  // When expirationAttribute is not set, or expirationDurationInSeconds is 0 - empty object is returned instead
  protected createExpirationDatePartial(): Partial<RecordType> {
    return this.tableAttributes.expirationAttribute &&
      this.tableAttributes.expirationDurationInSeconds &&
      this.tableAttributes.expirationDurationInSeconds > 0
      ? ({
          [this.tableAttributes.expirationAttribute]: new Date(
            new Date().getTime() + this.tableAttributes.expirationDurationInSeconds * 1000
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
