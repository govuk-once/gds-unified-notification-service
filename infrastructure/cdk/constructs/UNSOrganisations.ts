import { AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

import { EnvVars } from 'infrastructure/cdk/config';
import { UNSDynamoDb } from 'infrastructure/cdk/constructs/bases/UNSDynamoDBConstruct';
import { UNSDynamoDBWriterConstruct } from 'infrastructure/cdk/constructs/customResourceFnsConstructors/UNSDynamoDBWriterConstruct';
import { UNSCommon } from 'infrastructure/cdk/constructs/UNSCommon';
import { orgMetadata } from 'infrastructure/cdk/consumers/consumersMetadata';
import { SSMFromObject } from 'infrastructure/cdk/utils/SSMFromObject';

export class UNSOrganisationsCommon extends Construct {
  public readonly organisationsTable: UNSDynamoDb;

  constructor(scope: Construct, config: EnvVars, common: UNSCommon) {
    super(scope, 'organisations');

    //// =====================================================
    // DynamoDB Tables
    //// =====================================================
    this.organisationsTable = new UNSDynamoDb(this, config, {
      name: ['organisations'],
      partitionKey: 'OrganisationID',
      partitionKeyType: AttributeType.STRING,

      pointInTimeRecovery: true,
      resources: {
        kms: common.kms,
      },
      globalSecondaryIndexes: [],
    });

    //// =====================================================
    // Add organisation for certificate
    //// =====================================================
    const dynamoDBWriterProvider = new UNSDynamoDBWriterConstruct(this, config, this.organisationsTable, {
      kms: common.kms,
    });
    common.kms.grantEncryptDecrypt(dynamoDBWriterProvider.fn);

    for (const [OrganisationID, { DisplayName }] of Object.entries(orgMetadata)) {
      // Create an organisation record
      dynamoDBWriterProvider.createRecord(
        this,
        'OrganisationID',
        {
          OrganisationID: OrganisationID,
          DisplayName: DisplayName,
        },
        OrganisationID
      );
    }

    //// =====================================================
    // SSM
    //// =====================================================
    SSMFromObject(this, config, {
      // DynamoDB Tables
      'table/organisations/attributes': this.organisationsTable.attributes,
    });
  }
}
