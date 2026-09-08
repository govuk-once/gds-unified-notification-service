import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  IBucket,
  LifecycleRule,
  ObjectLockRetention,
} from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { applyCheckovSkipsS3Bucket } from 'infrastructure/cdk/utils/applyCheckovSkip';

export interface BucketProps {
  name: string[];
  lifecycleRules?: LifecycleRule[];
  objectLockDefaultRetention?: ObjectLockRetention;
  serverAccessLogs?: {
    bucket: IBucket;
    prefix?: string;
  };
}

export class UNSS3Bucket extends Construct {
  public bucket: Bucket;

  constructor(scope: Construct, config: EnvVars, props: BucketProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    super(scope, constructNamingHelper(...props.name));

    this.bucket = new Bucket(this, constructNamingHelper(...props.name, ` bucket`), {
      bucketName: namingHelper(...props.name),

      // Encryption at rest (Uses Amazon S3-managed keys / SSE-S3)
      encryption: BucketEncryption.S3_MANAGED,

      // Make it strictly private by blocking all public access
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,

      // Security best practice: Enforce TLS/HTTPS for data in transit
      enforceSSL: true,

      // Enable versioning
      versioned: true,

      // Teardown lifecycle configuration (Change to RETAIN for production data)
      removalPolicy: config.removalPolicy,
      autoDeleteObjects: !config.isMainEnv,

      lifecycleRules: props.lifecycleRules,

      // Object locking can only be set at creation time & sets objectLockEnabled to true
      objectLockDefaultRetention: props.objectLockDefaultRetention,

      // Destination & prefix of server access logs
      serverAccessLogsBucket: props.serverAccessLogs?.bucket,
      serverAccessLogsPrefix: props.serverAccessLogs?.prefix,
    });
    applyCheckovSkipsS3Bucket(this.bucket);
  }
}
