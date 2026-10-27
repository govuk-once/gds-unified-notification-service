import { Key } from 'aws-cdk-lib/aws-kms';
import { CodeSigningConfig } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { EnvVars } from '@infra/cdk/config';
import { UNSCustomResourceConstruct } from '@infra/cdk/constructs/bases/UNSCustomResourceConstruct';
import { GenerateCertificatesProps } from '@infra/cdk/customResourceFns/unsClientCertificateCSRGenerator';

export class UNSClientCertificateGeneratorConstruct extends UNSCustomResourceConstruct<GenerateCertificatesProps> {
  constructor(scope: Construct, config: EnvVars, props: { kms: Key; codeSigningConfig: CodeSigningConfig }) {
    super(scope, config, {
      name: ['csr-generator'],
      tsFn: 'unsClientCertificateCSRGenerator',
      modules: ['node-forge'],
      kms: props.kms,
      codeSigningConfig: props.codeSigningConfig,
    });
  }
}
