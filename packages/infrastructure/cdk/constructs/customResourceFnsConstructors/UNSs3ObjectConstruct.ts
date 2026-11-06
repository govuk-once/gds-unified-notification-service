import { Key } from 'aws-cdk-lib/aws-kms';
import { CodeSigningConfig } from 'aws-cdk-lib/aws-lambda';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { EnvVars } from '@infra/cdk/config';
import { UNSCustomResourceConstruct } from '@infra/cdk/constructs/bases/UNSCustomResourceConstruct';
import { unss3ObjectWriterProps } from '@infra/cdk/customResourceFns/unss3ObjectWriter';

export class UNSs3ObjectConstruct extends UNSCustomResourceConstruct<unss3ObjectWriterProps> {
  constructor(
    scope: Construct,
    config: EnvVars,
    props: { kms: Key; bucket: IBucket; codeSigningConfig: CodeSigningConfig }
  ) {
    super(scope, config, {
      name: ['s3-writer'],
      tsFn: 'unss3ObjectWriter',
      modules: [],
      kms: props.kms,
      codeSigningConfig: props.codeSigningConfig,
    });
    props.bucket.grantPut(this.fn);
    props.bucket.grantDelete(this.fn);
  }
}
