import * as cdk from 'aws-cdk-lib';
import * as acmpca from 'aws-cdk-lib/aws-acmpca';
import { Key } from 'aws-cdk-lib/aws-kms';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSClientCertificateGeneratorConstruct } from 'infrastructure/cdk/constructs/customResourceFnsConstructors/UNSClientCertificateGeneratorConstruct';
import { UNSDynamoDBWriterConstruct } from 'infrastructure/cdk/constructs/customResourceFnsConstructors/UNSDynamoDBWriterConstruct';
import { UNSSMWriterProvider } from 'infrastructure/cdk/constructs/customResourceFnsConstructors/UNSSMWriterConstruct';

export interface UNSClientCertificateConstructRefs {
  readonly encryptionKey: Key;
  readonly certificateAuthorityArn: string;
  readonly csrProvider: UNSClientCertificateGeneratorConstruct;
  readonly dynamoDBWriterProvider: UNSDynamoDBWriterConstruct;
  readonly smWriterProvider: UNSSMWriterProvider;
}

export interface UNSClientCertificateConstructProps {
  // Certificate details
  readonly certificateId: string;
  readonly startDate: Date;
  readonly expirationDate: Date;
  readonly subject: {
    readonly commonName: string;
    readonly organization: string;
    readonly organizationalUnit: string;
  };
}

export class UNSClientCertificateConstruct extends Construct {
  public readonly certificate: acmpca.CfnCertificate;
  public readonly privateKeySecret: secretsmanager.Secret;
  public readonly privateKeyCRT: secretsmanager.Secret;

  constructor(
    scope: Construct,
    id: string,
    config: EnvVars,
    refs: UNSClientCertificateConstructRefs,
    props: UNSClientCertificateConstructProps
  ) {
    super(scope, id);
    const { constructNamingHelper } = config.utils;

    // Create a placeholder Secret to securely capture the generated outputs
    this.privateKeySecret = new secretsmanager.Secret(this, constructNamingHelper('sm', 'private-key'), {
      secretName: `${config.prefix}/tls/${props.certificateId}/private-key`,
      description: `Generated RSA Private Key for ${props.certificateId}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryptionKey: refs.encryptionKey,
    });
    this.privateKeySecret.grantWrite(refs.csrProvider.fn);

    this.privateKeyCRT = new secretsmanager.Secret(this, constructNamingHelper('crt'), {
      secretName: `${config.prefix}/tls/${props.certificateId}/crt`,
      description: `Generated CRT file for ${props.certificateId}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryptionKey: refs.encryptionKey,
    });
    this.privateKeyCRT.grantWrite(refs.smWriterProvider.fn);

    // Invoke the Custom Resource to generate and save keys to S3
    const tlsGenerationExecution = refs.csrProvider.use(this, {
      secretArn: this.privateKeySecret.secretArn,
      commonName: props.subject.commonName,
      organization: props.subject.organization,
      organizationalUnit: props.subject.organization,
    });

    // Pipe the generated CSR directly into the ACM Private CA Certificate
    this.certificate = new acmpca.CfnCertificate(this, constructNamingHelper('cert'), {
      certificateAuthorityArn: refs.certificateAuthorityArn,
      certificateSigningRequest: tlsGenerationExecution.getAttString('CertRequestPem'),
      signingAlgorithm: 'SHA256WITHRSA',
      validity: {
        type: 'ABSOLUTE',
        value: Math.floor(props.expirationDate.getTime() / 1000),
      },
      validityNotBefore: {
        type: 'ABSOLUTE',
        value: Math.floor(props.startDate.getTime() / 1000),
      },
    });

    // Export Certificate file to SM
    refs.smWriterProvider.use(this, {
      secretArn: this.privateKeyCRT.secretArn,
      secretValue: this.certificate.attrCertificate,
    });

    // Create a revocation record
    refs.dynamoDBWriterProvider.createRecord(this, 'Id', {
      IdToSerializeToSha256: this.certificate.attrCertificate,
      Arn: this.certificate.attrArn,
      StartDate: props.startDate,
      EndDate: props.expirationDate,
      Organization: props.subject.organization,
      OrganizationalUnit: props.subject.organizationalUnit,
      CommonName: props.subject.commonName,
      Revoked: false,
    });
  }
}
