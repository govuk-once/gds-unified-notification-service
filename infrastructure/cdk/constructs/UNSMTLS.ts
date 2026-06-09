import { AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

import { CustomResource } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSCertificateAuthorityConstruct } from 'infrastructure/cdk/constructs/bases/UNSCertificateAuthorityConstruct';
import { UNSClientCertificateConstruct } from 'infrastructure/cdk/constructs/bases/UNSClientCertificateConstruct';
import { UNSDynamoDb } from 'infrastructure/cdk/constructs/bases/UNSDynamoDBContruct';
import { UNSClientCertificateGeneratorConstruct } from 'infrastructure/cdk/constructs/customResourceFnsConstructors/UNSClientCertificateGeneratorConstruct';
import { UNSDynamoDBWriterConstruct } from 'infrastructure/cdk/constructs/customResourceFnsConstructors/UNSDynamoDBWriterConstruct';
import { UNSs3ObjectConstruct } from 'infrastructure/cdk/constructs/customResourceFnsConstructors/UNSs3ObjectConstruct';
import { UNSSMWriterProvider } from 'infrastructure/cdk/constructs/customResourceFnsConstructors/UNSSMWriterConstruct';
import { UNSCommon } from 'infrastructure/cdk/constructs/UNSCommon';
import { getConsumers } from 'infrastructure/cdk/consumers/consumers';
import { applyCheckovSkips } from 'infrastructure/cdk/utils/applyCheckovSkip';
import { v4 } from 'uuid';

export class UNSMTLSCommon extends Construct {
  public readonly certificateAuthority: UNSCertificateAuthorityConstruct;
  public readonly revocationTable: UNSDynamoDb;
  public readonly truststoreUpload: CustomResource;
  public readonly truststorePath: string;

  constructor(scope: Construct, config: EnvVars, common: UNSCommon) {
    const { constructNamingHelper, namingHelper } = config.utils;
    super(scope, 'mtls');

    //// =====================================================
    // DynamoDB Tables
    //// =====================================================
    this.revocationTable = new UNSDynamoDb(this, config, {
      name: ['certificates'],
      partitionKey: 'Id',
      partitionKeyType: AttributeType.STRING,

      pointInTimeRecovery: true,

      resources: {
        kms: common.kms,
      },
    });

    //// =====================================================
    // S3 Buckets
    //// =====================================================
    const truststoreBucket = new s3.Bucket(this, constructNamingHelper(`truststore`, ` bucket`), {
      bucketName: namingHelper(`mtls-certificates`),
      // Encryption at rest (Uses Amazon S3-managed keys / SSE-S3)
      encryption: s3.BucketEncryption.S3_MANAGED,

      // Make it strictly private by blocking all public access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,

      // Security best practice: Enforce TLS/HTTPS for data in transit
      enforceSSL: true,

      // Enable versioning
      versioned: true,

      // Teardown lifecycle configuration (Change to RETAIN for production data)
      removalPolicy: config.removalPolicy,
      autoDeleteObjects: !config.isMainEnv,
    });
    applyCheckovSkips(truststoreBucket, [
      ['CKV_AWS_18', 'Access logs may not be necessary for this bucket - as it should covered by cloudtrail'],
    ]);

    //// =====================================================
    // Certficate authority
    //// =====================================================
    this.certificateAuthority = new UNSCertificateAuthorityConstruct(this, config, {
      certificateUsageMode: config.isMainEnv ? 'GENERAL_PURPOSE' : 'SHORT_LIVED_CERTIFICATE',
      // Main env certs are valid 10 years, sandbox roll sunday to sunday
      certificateValidityEndDate: config.isMainEnv ? new Date('2036-01-01') : config.utils.nextSunday(),
      certificateValidityStartDate: config.isMainEnv ? undefined : config.utils.lastSunday(),
    });

    // ApiGateway tends to 'reserve' truststore file forever, and cannot share it with other api gateways
    // In order to support future mTLS cert sharing between dev & sandbox environment
    const uuid = v4();
    this.truststoreUpload = new UNSs3ObjectConstruct(this, config, {
      bucket: truststoreBucket,
      kms: common.kms,
    }).use(this, {
      bucket: truststoreBucket.bucketName,
      key: `truststore.${uuid}.pem`,
      source: this.certificateAuthority.certificate.attrCertificate,
    });
    this.truststorePath = truststoreBucket.s3UrlForObject(`truststore.${uuid}.pem`);

    //// =====================================================
    // Client certificate generation
    //// =====================================================
    const csrProvider = new UNSClientCertificateGeneratorConstruct(this, config, { kms: common.kms });
    common.kms.grantEncryptDecrypt(csrProvider.fn);

    const dynamoDBWriterProvider = new UNSDynamoDBWriterConstruct(this, config, this.revocationTable, {
      kms: common.kms,
    });
    common.kms.grantEncryptDecrypt(dynamoDBWriterProvider.fn);

    const smWriterProvider = new UNSSMWriterProvider(this, config, { kms: common.kms });
    common.kms.grantEncryptDecrypt(smWriterProvider.fn);

    for (const certificateDetails of getConsumers(config.env, config)) {
      const certificate = new UNSClientCertificateConstruct(
        this,
        certificateDetails.id,
        config,
        // Add references & providers
        {
          encryptionKey: common.kms,
          certificateAuthorityArn: this.certificateAuthority.certificateAuthority.attrArn,
          csrProvider,
          dynamoDBWriterProvider,
          smWriterProvider,
        },
        // Add certificate settings
        {
          certificateId: certificateDetails.id,
          startDate: certificateDetails.startDate,
          expirationDate: certificateDetails.expirationDate,
          subject: {
            commonName: certificateDetails.commonName,
            organization: certificateDetails.organization,
            organizationalUnit: certificateDetails.organizationalUnit,
          },
        }
      );
      certificate.node.addDependency(this.certificateAuthority.certificate);
      certificate.node.addDependency(this.certificateAuthority.certificateActivation);
      certificate.node.addDependency(this.certificateAuthority.certificateAuthority);
    }
  }
}
