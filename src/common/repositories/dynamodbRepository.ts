import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  AttributeValue,
  ConsumedCapacity,
  DeleteItemCommandInput,
  DynamoDB,
  QueryCommandInput,
  ReturnConsumedCapacity,
  ScanCommandInput,
  UpdateItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { ParsingFailedError, ServiceMisconfigurationError } from '@common/models/Errors/InternalServerError';
import { IDynamoAttributes, IDynamoAttributesSchema } from '@common/repositories/interfaces/IDynamoKeys';
import { ConfigurationService, MetricsLabels, ObservabilityService } from '@common/services';
import { zodErrorFormatter } from '@common/utils';
import z, { ZodObject } from 'zod';

export abstract class DynamodbRepository<RecordSchema extends ZodObject> {
  protected tableAttributes!: IDynamoAttributes;
  protected abstract recordSchema: RecordSchema;

  constructor(
    protected config: ConfigurationService,
    protected client: DynamoDB,
    protected observability: ObservabilityService
  ) {}

  public async initialize(tableAttributesParameter: string) {
    this.tableAttributes = await this.config.getParameterAsType(tableAttributesParameter, IDynamoAttributesSchema);
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
        const cu = consumedCapacity.CapacityUnits ?? 0;
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
        this.observability.logger.info(`Dynamodb Usage`, { label, table, cu, rcu, wcu, gsi, lsi });
      }
    }
    return result;
  }

  public async createRecord(record: z.infer<RecordSchema>): Promise<void> {
    this.observability.logger.info('Creating record in table', { tableName: this.tableAttributes.name });

    const { data, error } = this.recordSchema.safeParse(record);
    if (error) {
      this.observability.logger.error('Input to create record does not match the record schema', record);
      throw new ParsingFailedError(['Input to create record does not match the record schema']);
    }

    try {
      await this.observeCapacity(
        this.createRecord.name,
        this.client.putItem({
          TableName: this.tableAttributes.name,
          Item: marshall(this.beforeCreate(data), { removeUndefinedValues: true }),
          ReturnConsumedCapacity: ReturnConsumedCapacity.TOTAL,
        })
      );
      this.observability.logger.info('Successfully created record in table', { tableName: this.tableAttributes.name });
    } catch (error) {
      this.observability.logger.error('Failure in creating record table', {
        tableName: this.tableAttributes.name,
        error: this.observability.formatError(error),
      });
      throw error;
    }
  }

  public async createRecordBatch(batchRecords: z.infer<RecordSchema>[]): Promise<void> {
    this.observability.logger.info('Creating records in table', {
      batchRecordLength: batchRecords.length,
      tableName: this.tableAttributes.name,
    });

    const parsedBatchRecords = batchRecords.flatMap((record) => {
      const { data, error } = this.recordSchema.safeParse(record);

      if (error) {
        this.observability.logger.error(
          'An item in array to create a batch of records does not match the record schema',
          record
        );
        throw new ParsingFailedError([
          'An item in array to create a batch of records does not match the record schema',
        ]);
      }

      return [data];
    });

    try {
      if (batchRecords.length === 0) {
        this.observability.logger.warn(`Triggered createRecordBatch with an empty array`);
        return;
      }
      if (batchRecords.length > 25) {
        throw new Error('To create batch records, array length must be no greater than 25');
      }

      await this.observeCapacity(
        this.createRecordBatch.name,
        this.client.batchWriteItem({
          RequestItems: {
            [this.tableAttributes.name]: parsedBatchRecords.map((record) => ({
              PutRequest: {
                Item: marshall(this.beforeCreate(record), { removeUndefinedValues: true }),
              },
            })),
          },
          ReturnConsumedCapacity: ReturnConsumedCapacity.TOTAL,
        })
      );

      this.observability.logger.info('Successfully created records in table', { tableName: this.tableAttributes.name });
    } catch (error) {
      this.observability.logger.error('Failure in creating records table', {
        tableName: this.tableAttributes.name,
        error: this.observability.formatError(error),
      });
      throw error;
    }
  }

  public async updateRecord(
    recordFields: Partial<z.infer<RecordSchema>>,
    options?: { resetExpirationDate: boolean }
  ): Promise<void> {
    this.observability.logger.info('Update record in table', {
      tableName: this.tableAttributes.name,
      key: this.tableAttributes.hashKey,
    });

    const { data, error } = this.recordSchema.partial().safeParse(recordFields);
    if (error) {
      this.observability.logger.error(
        'Fields used to update record in table do not match the record schema',
        recordFields
      );
      throw new ParsingFailedError(['Fields used to update record in table do not match the record schema']);
    }

    const keyValue = data[this.tableAttributes.hashKey];
    const attributes = new Set([
      this.tableAttributes.hashKey,
      this.tableAttributes.rangeKey,
      ...this.tableAttributes.attributes,
    ]);

    // Filter out known keys from payloads - as dynamodb updates cannot be updating those fields
    const entries = Object.entries(this.beforeUpdate(recordFields)).filter(
      ([key, value]) => !attributes.has(key) && value != undefined
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
      this.observability.logger.info('Successfully updated record in table', {
        tableName: this.tableAttributes.name,
        params,
        entries,
        recordFields,
      });
    } catch (error) {
      this.observability.logger.error(`Failure in updating record table`, {
        tableName: this.tableAttributes.name,
        error: this.observability.formatError(error),
        params,
        entries,
        recordFields,
      });

      throw error;
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
      this.observability.logger.info('Successfully updated record in table', {
        tableName: this.tableAttributes.name,
        params,
        listKey,
        item,
      });
    } catch (error) {
      this.observability.logger.error('Failure in updating record table', {
        tableName: this.tableAttributes.name,
        error: this.observability.formatError(error),
        params,
        listKey,
        item,
      });
      throw error;
    }
  }

  public async getRecord(keyValue: string): Promise<z.infer<RecordSchema> | null> {
    this.observability.logger.info('Retrieving record in table', {
      tableName: this.tableAttributes.name,
      key: this.tableAttributes.hashKey,
      value: keyValue,
    });

    const params = {
      TableName: this.tableAttributes.name,
      Key: marshall({
        [this.tableAttributes.hashKey]: keyValue,
      }),
    };

    try {
      const { Item } = await this.client.getItem(params);

      if (!Item) {
        this.observability.logger.info('No item in table', {
          tableName: this.tableAttributes.name,
          key: this.tableAttributes.hashKey,
          value: keyValue,
        });
        return null;
      }

      const result = unmarshall(Item);
      const { data, error } = this.recordSchema.safeParse(result);

      if (error) {
        this.observability.logger.error('Record in table failed to parse to record schema', {
          tableName: this.tableAttributes.name,
          key: this.tableAttributes.hashKey,
          value: keyValue,
        });
        throw new ParsingFailedError(['Record in table failed to parse to record schema', ...zodErrorFormatter(error)]);
      }

      this.observability.logger.info('Retrieved record in table', {
        tableName: this.tableAttributes.name,
        key: this.tableAttributes.hashKey,
        value: keyValue,
        result,
      });
      return data;
    } catch (error) {
      this.observability.logger.error('Failure in getting record for table', {
        tableName: this.tableAttributes.name,
        error: this.observability.formatError(error),
      });
      throw error;
    }
  }

  public async deleteRecord(partitionKeyValue: string, sortKeyValue?: string): Promise<void> {
    this.observability.logger.info('Deleting record in table', {
      tableName: this.tableAttributes.name,
      key: this.tableAttributes.hashKey,
      partitionKeyValue: partitionKeyValue,
      sortKeyValue: sortKeyValue,
    });

    if (sortKeyValue && !this.tableAttributes.rangeKey) {
      throw new ServiceMisconfigurationError(['A sort key value has been used for a table with no sort key']);
    }

    if (this.tableAttributes.rangeKey && !sortKeyValue) {
      throw new ServiceMisconfigurationError(['Table requires a sort key to delete record, but none was provided']);
    }

    const params: DeleteItemCommandInput = {
      TableName: this.tableAttributes.name,
      Key: marshall({
        [this.tableAttributes.hashKey]: partitionKeyValue,
        // Adds sort key to params if the table requires a sort key
        ...(this.tableAttributes.rangeKey && sortKeyValue ? { [this.tableAttributes.rangeKey]: sortKeyValue } : {}),
      }),
      ReturnConsumedCapacity: ReturnConsumedCapacity.TOTAL,
    };

    try {
      await this.observeCapacity(this.deleteRecord.name, this.client.deleteItem(params));
      this.observability.logger.info('Successfully deleted record in table', {
        tableName: this.tableAttributes.name,
        key: this.tableAttributes.hashKey,
      });
    } catch (error) {
      this.observability.logger.error('Failure in deleting record in table', {
        tableName: this.tableAttributes.name,
        key: this.tableAttributes.hashKey,
        error: this.observability.formatError(error),
      });
      throw error;
    }
  }

  public async getRecords(
    filter?: { field: string; value: string },
    indexName?: string
  ): Promise<z.infer<RecordSchema>[]> {
    const params: ScanCommandInput = {
      TableName: this.tableAttributes.name,
      ...(filter && {
        FilterExpression: '#filterField = :filterValue',
        ExpressionAttributeNames: { '#filterField': filter.field },
        ExpressionAttributeValues: marshall({ ':filterValue': filter.value }),
        IndexName: indexName,
        ReturnConsumedCapacity: ReturnConsumedCapacity.TOTAL,
      }),
    };

    try {
      const { Items } = await this.observeCapacity(this.getRecord.name, this.client.scan(params));
      if (!Items || Items.length === 0) {
        return [];
      }

      return this.parseArrayOfRecords(Items);
    } catch (error) {
      this.observability.logger.error('Failure in getting records for table', {
        tableName: this.tableAttributes.name,
        error: this.observability.formatError(error),
      });
      throw error;
    }
  }

  public async getRecordsQuery(
    filter?: { field: string; value: string },
    indexName?: string
  ): Promise<z.infer<RecordSchema>[]> {
    const params: QueryCommandInput = {
      TableName: this.tableAttributes.name,
      ...(filter && {
        KeyConditionExpression: `${filter.field} = :filterValue`,
        ExpressionAttributeValues: marshall({ ':filterValue': filter.value }),
        IndexName: indexName,
        ReturnConsumedCapacity: ReturnConsumedCapacity.TOTAL,
      }),
    };

    try {
      const { Items } = await this.observeCapacity(this.getRecordsQuery.name, this.client.query(params));
      if (!Items || Items.length === 0) {
        return [];
      }
      return this.parseArrayOfRecords(Items);
    } catch (error) {
      this.observability.logger.error('Failure in getting records (query) for table', {
        tableName: this.tableAttributes.name,
        error: this.observability.formatError(error),
      });
      throw error;
    }
  }

  public async incrementRecord(record: z.infer<RecordSchema>, counter: string): Promise<void> {
    this.observability.logger.info('Incrementing record in table', { tableName: this.tableAttributes.name });

    try {
      const keyValue = record[this.tableAttributes.hashKey as keyof z.infer<RecordSchema>];
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
      this.observability.logger.error('Failure in adding record or incrementing in table', {
        error: this.observability.formatError(error),
        tableName: this.tableAttributes.name,
      });
      throw error;
    }
  }

  // Generates expiration field that can be injected as partial into create/update calls
  // When expirationAttribute is not set, or expirationDurationInSeconds is 0 - empty object is returned instead
  protected createExpirationDatePartial(expirationInDays?: number): Partial<z.infer<RecordSchema>> {
    if (this.tableAttributes.expirationAttribute && expirationInDays) {
      return {
        [this.tableAttributes.expirationAttribute]: new Date(
          Date.now() + expirationInDays * 24 * 60 * 60 * 1000
        ).toISOString(),
      } as Partial<z.infer<RecordSchema>>;
    }

    if (
      this.tableAttributes.expirationAttribute &&
      this.tableAttributes.expirationDurationInSeconds &&
      this.tableAttributes.expirationDurationInSeconds > 0
    ) {
      return {
        [this.tableAttributes.expirationAttribute]: new Date(
          Date.now() + this.tableAttributes.expirationDurationInSeconds * 1000
        ).toISOString(),
      } as Partial<z.infer<RecordSchema>>;
    }

    return {};
  }

  // Allows overwriting logic before triggers
  public beforeCreate(record: z.infer<RecordSchema>) {
    return {
      ...record,
      // Dynamically inject expiration date if table calls for it
      ...this.createExpirationDatePartial(),
    };
  }

  public beforeUpdate(partial: Partial<z.infer<RecordSchema>>, options?: { resetExpirationDate: boolean }) {
    return {
      ...partial,
      // Inject expiration date property dynamically during updates if relevant option has been set
      ...(options?.resetExpirationDate ? this.createExpirationDatePartial() : {}),
    };
  }

  private parseArrayOfRecords(items: Record<string, AttributeValue>[]): z.infer<RecordSchema>[] {
    return items.flatMap((rawItem) => {
      const unmarshalledItem = unmarshall(rawItem);
      const { data, error } = this.recordSchema.safeParse(unmarshalledItem);

      if (error) {
        this.observability.logger.error('Record in table failed to parse to record schema, filtering out record', {
          tableName: this.tableAttributes.name,
          key: this.tableAttributes.hashKey,
          value: unmarshalledItem[this.tableAttributes.hashKey] ?? undefined,
          zodErrors: zodErrorFormatter(error),
        });
        return [];
      }
      return [data];
    });
  }
}
