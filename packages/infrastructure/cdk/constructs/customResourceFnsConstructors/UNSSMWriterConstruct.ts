import { Key } from 'aws-cdk-lib/aws-kms';
import { CodeSigningConfig } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { EnvVars } from '@infra/cdk/config';
import { UNSCustomResourceConstruct } from '@infra/cdk/constructs/bases/UNSCustomResourceConstruct';
import { UNSSMWriterProps } from '@infra/cdk/customResourceFns/unsSMWriter';

export class UNSSMWriterProvider extends UNSCustomResourceConstruct<UNSSMWriterProps> {
  constructor(
    scope: Construct,
    config: EnvVars,
    props: { kms: Key; names?: string[]; codeSigningConfig: CodeSigningConfig }
  ) {
    super(scope, config, {
      name: [`sm-writer`, ...(props.names ?? [])],
      tsFn: 'unsSMWriter',
      modules: [],
      kms: props.kms,
      codeSigningConfig: props.codeSigningConfig,
    });
  }
}
