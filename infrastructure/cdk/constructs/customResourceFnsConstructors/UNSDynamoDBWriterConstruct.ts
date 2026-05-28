import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSCustomResourceConstruct } from 'infrastructure/cdk/constructs/bases/UNSCustomResourceConstruct';
import { UNSDynamoDb } from 'infrastructure/cdk/constructs/bases/UNSDynamoDBContruct';
import { UNSDynamoDbWriterProps } from 'infrastructure/cdk/customResourceFns/unsDynamoDBWriter';

export class UNSDynamoDBWriterConstruct extends UNSCustomResourceConstruct<UNSDynamoDbWriterProps> {
  public readonly table: UNSDynamoDb;
  constructor(scope: Construct, config: EnvVars, table: UNSDynamoDb) {
    super(scope, config, {
      name: ['dynamodb-writer'],
      tsFn: 'unsDynamoDBWriter',
      modules: [],
    });

    this.table = table;
    table.table.grantReadWriteData(this.fn);
  }

  public createRecord(caller: Construct, idAttribute: string, data: UNSDynamoDbWriterProps['data']) {
    this.use(caller, {
      table: this.table.attributes.name,
      idAttribute,
      data,
    });
  }
}
