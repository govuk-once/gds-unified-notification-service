import { Key } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSCustomResourceConstruct } from 'infrastructure/cdk/constructs/bases/UNSCustomResourceConstruct';
import { GenerateCertificatesProps } from 'infrastructure/cdk/customResourceFns/unsClientCertificateCSRGenerator';

export class UNSClientCertificateGeneratorConstruct extends UNSCustomResourceConstruct<GenerateCertificatesProps> {
  constructor(scope: Construct, config: EnvVars, props: { kms: Key }) {
    super(scope, config, {
      name: ['csr-generator'],
      tsFn: 'unsClientCertificateCSRGenerator',
      modules: ['node-forge'],
      kms: props.kms,
    });
  }
}
