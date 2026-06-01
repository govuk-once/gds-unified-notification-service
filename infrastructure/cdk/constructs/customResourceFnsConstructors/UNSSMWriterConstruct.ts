import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSCustomResourceConstruct } from 'infrastructure/cdk/constructs/bases/UNSCustomResourceConstruct';
import { UNSSMWriterProps } from 'infrastructure/cdk/customResourceFns/unsSMWriter';

export class UNSSMWriterProvider extends UNSCustomResourceConstruct<UNSSMWriterProps> {
  constructor(scope: Construct, config: EnvVars) {
    super(scope, config, {
      name: ['sm-writer'],
      tsFn: 'unsSMWriter',
      modules: [],
    });
  }
}
