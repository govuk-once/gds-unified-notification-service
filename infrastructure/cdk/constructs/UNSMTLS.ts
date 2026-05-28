import { AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

import * as s3 from 'aws-cdk-lib/aws-s3';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSCertificateAuthorityConstruct } from 'infrastructure/cdk/constructs/bases/UNSCertificateAuthorityConstruct';
import { UNSClientCertificateConstruct } from 'infrastructure/cdk/constructs/bases/UNSClientCertificateConstruct';
import { UNSDynamoDb } from 'infrastructure/cdk/constructs/bases/UNSDynamoDBContruct';
import { UNSS3FileUploadConstruct } from 'infrastructure/cdk/constructs/bases/UNSS3FileUploadConstruct';
import { UNSClientCertificateGeneratorConstruct } from 'infrastructure/cdk/constructs/customResourceFnsConstructors/UNSClientCertificateGeneratorConstruct';
import { UNSDynamoDBWriterConstruct } from 'infrastructure/cdk/constructs/customResourceFnsConstructors/UNSDynamoDBWriterConstruct';
import { UNSSMWriterProvider } from 'infrastructure/cdk/constructs/customResourceFnsConstructors/UNSSMWriterConstruct';
import { UNSCommon } from 'infrastructure/cdk/constructs/UNSCommon';
import { getConsumers } from 'infrastructure/cdk/consumers/consumers';

export class UNSMTLSCommon extends Construct {
  public readonly certificateAuthority: UNSCertificateAuthorityConstruct;
  public readonly revocationTable: UNSDynamoDb;
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
      autoDeleteObjects: config.isMainEnv ? false : true,
    });

    //// =====================================================
    // Certficate authority
    //// =====================================================
    this.certificateAuthority = new UNSCertificateAuthorityConstruct(this, config, {
      certificateUsageMode: config.isMainEnv ? 'GENERAL_PURPOSE' : 'SHORT_LIVED_CERTIFICATE',
      // Main env certs are valid 10 years, sandbox dev ones: 48h
      certificateValidityEndDate: config.isMainEnv
        ? new Date('2036-01-01')
        : new Date(Date.now() + 1000 * 60 * 60 * 24 * 2),
    });
    const truststoreUpload = new UNSS3FileUploadConstruct(this, constructNamingHelper(`truststore-upload`), {
      contents: this.certificateAuthority.certificate.attrCertificate,
      destinationBucket: truststoreBucket,
      path: `truststore.pem`,
    });
    this.truststorePath = truststoreBucket.s3UrlForObject(`truststore.pem`);

    //// =====================================================
    // Client certificate generation
    //// =====================================================
    const csrProvider = new UNSClientCertificateGeneratorConstruct(this, config);
    const dynamoDBWriterProvider = new UNSDynamoDBWriterConstruct(this, config, this.revocationTable);
    const smWriterProvider = new UNSSMWriterProvider(this, config);

    for (const certificateDetails of getConsumers(config.env)) {
      const certificate = new UNSClientCertificateConstruct(
        this,
        certificateDetails.id,
        config,
        // Add references & providers
        {
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
    }
  }
}
