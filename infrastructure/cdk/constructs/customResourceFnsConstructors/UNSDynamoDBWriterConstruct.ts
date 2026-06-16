import { Key } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSCustomResourceConstruct } from 'infrastructure/cdk/constructs/bases/UNSCustomResourceConstruct';
import { UNSDynamoDb } from 'infrastructure/cdk/constructs/bases/UNSDynamoDBConstruct';
import { UNSDynamoDbWriterProps } from 'infrastructure/cdk/customResourceFns/unsDynamoDBWriter';

export class UNSDynamoDBWriterConstruct extends UNSCustomResourceConstruct<UNSDynamoDbWriterProps> {
  public readonly table: UNSDynamoDb;
  constructor(scope: Construct, config: EnvVars, table: UNSDynamoDb, props: { kms: Key }) {
    super(scope, config, {
      name: [`dynamodb-writer-${table.attributes.name}`],
      tsFn: 'unsDynamoDBWriter',
      modules: [],
      kms: props.kms,
    });

    this.table = table;
    table.table.grantReadWriteData(this.fn);
  }

  public createRecord(
    caller: Construct,
    idAttribute: string,
    data: UNSDynamoDbWriterProps['data'],
    constructId: string
  ) {
    this.use(
      caller,
      {
        table: this.table.attributes.name,
        idAttribute,
        data,
      },
      {
        name: [constructId],
      }
    );
  }
}
