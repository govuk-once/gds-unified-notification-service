import * as cdk from 'aws-cdk-lib';
import * as acmpca from 'aws-cdk-lib/aws-acmpca';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';

export interface UNSCertificateAuthorityConstructProps {
  readonly certificateUsageMode: 'GENERAL_PURPOSE' | 'SHORT_LIVED_CERTIFICATE';
  readonly certificateValidityEndDate: Date;
}

export class UNSCertificateAuthorityConstruct extends Construct {
  public readonly certificateAuthority: acmpca.CfnCertificateAuthority;
  public readonly certificate: acmpca.CfnCertificate;
  public readonly certificateActivation: acmpca.CfnCertificateAuthorityActivation;

  constructor(scope: Construct, config: EnvVars, props: UNSCertificateAuthorityConstructProps) {
    super(scope, config.utils.constructNamingHelper(`ca`));

    const { namingHelper, constructNamingHelper } = config.utils;

    // Create the Private Certificate Authority (Root CA)
    this.certificateAuthority = new acmpca.CfnCertificateAuthority(this, constructNamingHelper('ca'), {
      type: 'ROOT',
      keyAlgorithm: 'RSA_4096',
      signingAlgorithm: 'SHA512WITHRSA',
      subject: {
        commonName: config.ssm.hostedZoneName,
      },
      usageMode: props.certificateUsageMode,
    });

    // Prevent deletions
    this.certificateAuthority.cfnOptions.deletionPolicy = config.deletionPolicy;
    this.certificateAuthority.cfnOptions.updateReplacePolicy = config.deletionPolicy;

    //  Provision the self-signed Root Certificate configuration
    this.certificate = new acmpca.CfnCertificate(this, constructNamingHelper('root-cert'), {
      certificateAuthorityArn: this.certificateAuthority.attrArn,
      certificateSigningRequest: this.certificateAuthority.attrCertificateSigningRequest,
      signingAlgorithm: 'SHA512WITHRSA',
      templateArn: `arn:${cdk.Aws.PARTITION}:acm-pca:::template/RootCACertificate/V1`,
      validity: {
        type: 'ABSOLUTE',
        value: Math.floor(props.certificateValidityEndDate.getTime() / 1000),
      },
    });

    // Prevent deletions
    this.certificate.cfnOptions.deletionPolicy = config.deletionPolicy;
    this.certificate.cfnOptions.updateReplacePolicy = config.deletionPolicy;

    // Activation Link and Activate the Certificate onto the Authority instance
    this.certificateActivation = new acmpca.CfnCertificateAuthorityActivation(this, namingHelper('ca-activation'), {
      certificateAuthorityArn: this.certificateAuthority.attrArn,
      certificate: this.certificate.attrCertificate,
    });
  }
}
