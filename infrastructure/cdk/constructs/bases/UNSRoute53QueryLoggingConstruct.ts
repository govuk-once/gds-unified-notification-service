import { Key } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { CfnResourcePolicy, LogGroup } from 'aws-cdk-lib/aws-logs';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
  PhysicalResourceIdReference,
} from 'aws-cdk-lib/custom-resources';
import { Effect, PolicyDocument, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

// Requires a stack with region us-east-1(N. Virginia) to be deployed.
export interface UNSRoute53QueryLoggingConstructProps {
  name: string[];
  kms: Key;
}

export class UNSRoute53QueryLoggingConstruct extends Construct {
  constructor(scope: Construct, config: EnvVars, props: UNSRoute53QueryLoggingConstructProps) {
    const { constructNamingHelper, namingHelper } = config.utils;
    super(scope, constructNamingHelper(...props.name));

    const rootDomain = config.ssm.hostedZoneName;
    let hostedZone: route53.IHostedZone | null = null;
    if (rootDomain !== null) {
      hostedZone = route53.HostedZone.fromLookup(this, namingHelper(`restapi`, '', 'hostedZone'), {
        domainName: rootDomain,
        privateZone: false,
      });
    }
    // Stop if hostedZone resource cant be found
    if (hostedZone === null) return;

    // Create a log group for this
    const queryLogGroup = new LogGroup(this, constructNamingHelper('lg', 'route53-query-logging'), {
      logGroupName: `/aws/route53/${namingHelper('route53-query-logging')}`,
      retention: config.retention,
      encryptionKey: props.kms,
      removalPolicy: config.removalPolicy,
    });

    // Set appropriate IAM by creating a new policy
    const route53LogDocument = new PolicyDocument({
      statements: [
        new PolicyStatement({
          sid: 'Route53Logging',
          effect: Effect.ALLOW,
          principals: [new ServicePrincipal('route53.amazonaws.com')],
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: [queryLogGroup.logGroupArn],
        }),
      ],
    });
    const resourcePolicy = new CfnResourcePolicy(this, constructNamingHelper(...props.name, 'resource-policy'), {
      policyName: namingHelper('dns-query-logging'),
      policyDocument: JSON.stringify(route53LogDocument.toJSON()),
    });

    // Create the resource to enable public hosted zone logging
    const queryLoggingConfig = new AwsCustomResource(
      this,
      constructNamingHelper(...props.name, 'create-query-logging-config'),
      {
        onCreate: {
          service: 'Route53',
          action: 'createQueryLoggingConfig',
          parameters: {
            HostedZoneId: hostedZone.hostedZoneId,
            CloudWatchLogsLogGroupArn: queryLogGroup.logGroupArn,
          },
          physicalResourceId: PhysicalResourceId.fromResponse('QueryLoggingConfig.Id'),
        },
        onDelete: {
          service: 'Route53',
          action: 'deleteQueryLoggingConfig',
          parameters: {
            Id: new PhysicalResourceIdReference(),
          },
        },
        policy: AwsCustomResourcePolicy.fromSdkCalls({
          resources: AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      }
    );

    queryLoggingConfig.node.addDependency(resourcePolicy);
  }
}
