import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSCustomResourceConstruct } from 'infrastructure/cdk/constructs/bases/UNSCustomResourceConstruct';
import { GenerateCertificatesProps } from 'infrastructure/cdk/customResourceFns/unsClientCertificateCSRGenerator';

export class UNSClientCertificateGeneratorConstruct extends UNSCustomResourceConstruct<GenerateCertificatesProps> {
  constructor(scope: Construct, config: EnvVars) {
    super(scope, config, {
      name: ['csr-generator'],
      tsFn: 'unsClientCertificateCSRGenerator',
      modules: ['node-forge'],
    });
  }
}
