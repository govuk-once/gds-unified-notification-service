import { Key } from 'aws-cdk-lib/aws-kms';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSCustomResourceConstruct } from 'infrastructure/cdk/constructs/bases/UNSCustomResourceConstruct';
import { unss3ObjectWriterProps } from 'infrastructure/cdk/customResourceFns/unss3ObjectWriter';

export class UNSs3ObjectConstruct extends UNSCustomResourceConstruct<unss3ObjectWriterProps> {
  constructor(scope: Construct, config: EnvVars, props: { kms: Key; bucket: IBucket }) {
    super(scope, config, {
      name: ['s3-writer'],
      tsFn: 'unss3ObjectWriter',
      modules: [],
      kms: props.kms,
    });
    props.bucket.grantPut(this.fn);
    props.bucket.grantDelete(this.fn);
  }
}
