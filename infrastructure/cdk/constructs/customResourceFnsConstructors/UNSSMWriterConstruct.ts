import { Key } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSCustomResourceConstruct } from 'infrastructure/cdk/constructs/bases/UNSCustomResourceConstruct';
import { UNSSMWriterProps } from 'infrastructure/cdk/customResourceFns/unsSMWriter';

export class UNSSMWriterProvider extends UNSCustomResourceConstruct<UNSSMWriterProps> {
  constructor(scope: Construct, config: EnvVars, props: { kms: Key, names?: string[] }) {
    super(scope, config, {
      name: [`sm-writer`, ...props.names ?? []],
      tsFn: 'unsSMWriter',
      modules: [],
      kms: props.kms,
    });
  }
}
