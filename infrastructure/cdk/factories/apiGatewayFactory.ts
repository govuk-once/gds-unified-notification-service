import {
  AccessLogField,
  AccessLogFormat,
  EndpointType,
  IAuthorizer,
  Integration,
  LogGroupLogDestination,
  RestApi,
  SecurityPolicy,
} from 'aws-cdk-lib/aws-apigateway';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { AccountPrincipal, AnyPrincipal, Effect, Policy, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { HttpMethod } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { RemovalPolicy, Stack } from 'aws-cdk-lib/core';
import { EnvVars } from 'infrastructure/cdk/config';
import { applyCheckovSkips } from 'infrastructure/cdk/utils/applyCheckovSkip';
export const apiGatewayFactory = (
  stack: Stack,
  config: EnvVars,
  props: {
    name: string[];
    type: 'MTLS' | 'PRIVATE' | 'PUBLIC';
    domain?: string;
    authorizer?: IAuthorizer;
    mtls?: {
      truststore: string;
    };
    resources: {
      mtlsTruststoreUrl?: string;
      vpce?: string[];
      authorizers?: string[];
      kms: IKey;
    };
    integrations?: Record<
      string,
      {
        path: string;
        method: HttpMethod;
        integration: Integration;
        authorizer?: IAuthorizer;
      }
    >;
    iam?: {
      allowOnlyFromKnownSources?: {
        awsAccountID: string;
        vpceIDs: string[];
      };
    };
  }
) => {
  const { namingHelper } = config.utils;

  // Setup custom domain - parameters are exposed via SSM values - these are generated on AWS account setup by infra team
  const rootDomain = config.ssm.hostedZoneName;
  const certificateArn = config.ssm.certificateArnRegional;
  const subdomain = props.domain ? (config.isMainEnv ? props.domain : namingHelper(props.domain)) : null;
  const fullDomain = subdomain ? `${subdomain}.${rootDomain}` : null;

  let hostedZone: route53.IHostedZone | null = null;
  let certificate: acm.ICertificate | null = null;
  if (rootDomain !== null && certificateArn !== null) {
    hostedZone = route53.HostedZone.fromLookup(stack, namingHelper(`restapi`, ...props.name, 'hostedZone'), {
      domainName: rootDomain,
      privateZone: false,
    });
    certificate = acm.Certificate.fromCertificateArn(
      stack,
      namingHelper(`restapi`, ...props.name, 'certificate'),
      certificateArn
    );
  }

  const mtlsTruststoreBucket = props.mtls
    ? s3.Bucket.fromBucketName(
        stack,
        namingHelper(`restapi`, ...props.name, 'truststoreBucket'),
        props.mtls.truststore.split(`s3://`).join(``).split(`/`).shift()!
      )
    : null;

  // API Gateway
  const restApi = new RestApi(stack, namingHelper(`restapi`, ...props.name, `restapi`), {
    restApiName: namingHelper(`restapi`, ...props.name),
    description: namingHelper(`restapi`, ...props.name),

    disableExecuteApiEndpoint: false,

    deployOptions: {
      tracingEnabled: true,
      metricsEnabled: true,
      cacheDataEncrypted: true,
      cachingEnabled: true,
      dataTraceEnabled: false,
      stageName: 'api',
      accessLogDestination: new LogGroupLogDestination(
        new LogGroup(stack, namingHelper(`restapi`, ...props.name, `loggroup`), {
          logGroupName: `/aws/apigw/${namingHelper(...props.name)}`,
          retention: RetentionDays.ONE_YEAR,
          encryptionKey: props.resources.kms,
          removalPolicy: RemovalPolicy.DESTROY,
        })
      ),

      accessLogFormat: AccessLogFormat.custom(
        JSON.stringify({
          requestId: AccessLogField.contextRequestId(),
          extendedRequestId: AccessLogField.contextExtendedRequestId(),
          ip: AccessLogField.contextIdentitySourceIp(),
          caller: AccessLogField.contextIdentityCaller(),
          user: AccessLogField.contextIdentityUser(),
          requestTime: AccessLogField.contextRequestTime(),
          httpMethod: AccessLogField.contextHttpMethod(),
          resourcePath: AccessLogField.contextResourcePath(),
          status: AccessLogField.contextStatus(),
          protocol: AccessLogField.contextProtocol(),
          responseLength: AccessLogField.contextResponseLength(),
        })
      ),
    },

    // Custom domain name
    ...(props.domain && fullDomain && certificate && rootDomain
      ? {
          domainName: {
            domainName: fullDomain,
            certificate: certificate,
            securityPolicy: SecurityPolicy.TLS_1_2,
            endpointType: props.type === 'PRIVATE' ? EndpointType.PRIVATE : EndpointType.REGIONAL,
            ...(props.mtls && mtlsTruststoreBucket
              ? {
                  mtls: {
                    bucket: mtlsTruststoreBucket,
                    key: props.mtls.truststore.split(`s3://`).join(``).split(`/`).slice(1).join(`/`),
                  },
                }
              : {}),
          },
          disableExecuteApiEndpoint: true,
        }
      : {}),
  });

  // When used as a private API Gateway - we add a policy to allow traffic only from a known VPCes
  if (props.iam?.allowOnlyFromKnownSources) {
    // Allow traffic from the single AWS account
    restApi.addToResourcePolicy(
      new PolicyStatement({
        principals: [new AccountPrincipal(props.iam.allowOnlyFromKnownSources.awsAccountID)],
        actions: ['execute-api:Invoke'],
        resources: [restApi.arnForExecuteApi()],
        effect: Effect.ALLOW,
      })
    );

    // Reject any traffic from unknown vpces
    restApi.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.DENY,
        principals: [new AnyPrincipal()],
        actions: ['execute-api:Invoke'],
        resources: [restApi.arnForExecuteApi()],
        conditions: {
          StringNotEquals: {
            'aws:SourceVpce': props.iam.allowOnlyFromKnownSources.vpceIDs,
          },
        },
      })
    );

    // Create an IAM role that allows invoking this API gateway from external account
    const role = new Role(stack, config.utils.namingHelper(`iamr-api-gateway`, ...props.name), {
      assumedBy: new AccountPrincipal(props.iam.allowOnlyFromKnownSources),
    });

    role.attachInlinePolicy(
      new Policy(stack, config.utils.namingHelper(`iamr`, ...props.name, `gateway-invoker`), {
        statements: [
          new PolicyStatement({
            actions: ['execute-api:Invoke'],
            resources: [restApi.arnForExecuteApi()],
          }),
        ],
      })
    );
  }

  // Register integrations
  for (const [operationId, { path, method, integration, authorizer }] of Object.entries(props.integrations ?? {})) {
    const resource = restApi.root.resourceForPath(path);
    const methodStruct = resource.addMethod(method, integration, {
      operationName: operationId,
      // If endpoint has a specific authorizer - use that, otherwise use one defined by API gateway
      authorizer: authorizer ?? props.authorizer,
    });

    applyCheckovSkips(methodStruct, [
      ['CKV_AWS_59', '"Ensure there is no open access to back-end resources through API"'],
    ]);
  }

  // Link up the api to the domain
  if (fullDomain && hostedZone) {
    new route53.ARecord(stack, namingHelper(...props.name, 'domain'), {
      zone: hostedZone,
      recordName: fullDomain,
      target: route53.RecordTarget.fromAlias(new route53targets.ApiGateway(restApi)),
    });
  }

  // Add WAF
  const managedRule = (ruleProps: { priority: number; name: string; managedRuleName: string; metricName: string }) => ({
    name: ruleProps.name,
    priority: ruleProps.priority,
    statement: {
      managedRuleGroupStatement: {
        vendorName: 'AWS',
        name: ruleProps.managedRuleName,
      },
    },
    overrideAction: { none: {} }, // Use the rule's native action (Block/Allow)
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: ruleProps.metricName,
      sampledRequestsEnabled: true,
    },
  });

  const webAcl = new wafv2.CfnWebACL(restApi, namingHelper(...props.name, 'waf'), {
    name: namingHelper(...props.name, 'waf'),
    scope: 'REGIONAL', // Required for API Gateway, ALB, and AppSync
    defaultAction: { allow: {} }, // Default to allowing requests unless blocked by a rule
    visibilityConfig: {
      metricName: namingHelper(...props.name, 'main-metric'),
      cloudWatchMetricsEnabled: true,
      sampledRequestsEnabled: true,
    },
    rules: [
      // # Common Rule Set
      // # https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html#aws-managed-rule-groups-baseline-crs
      managedRule({
        priority: 1,
        managedRuleName: 'AWSManagedRulesCommonRuleSet',
        metricName: `${config.prefix}-aws-common-rule-set`,
        name: namingHelper(...props.name, 'aws-common-rule-set'),
      }),

      // # Bad Input Rule Set
      // # https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html#aws-managed-rule-groups-baseline-known-bad-inputs
      managedRule({
        priority: 10,
        managedRuleName: 'AWSManagedRulesKnownBadInputsRuleSet',
        metricName: `${config.prefix}-aws-bad-input-rule-metric`,
        name: namingHelper(...props.name, 'aws-bad-input-rule-metric'),
      }),
      // # Anonymous IP list rule Set
      // # https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-ip-rep.html#aws-managed-rule-groups-ip-rep-anonymous
      managedRule({
        priority: 100,
        managedRuleName: 'AWSManagedRulesAnonymousIpList',
        metricName: `${config.prefix}-anonymous-ip-list-rule-metric`,
        name: namingHelper(...props.name, 'anonymous-ip-list-rule-metric'),
      }),
    ],
  });

  new wafv2.CfnWebACLAssociation(restApi, namingHelper(...props.name, 'waf-association'), {
    resourceArn: restApi.deploymentStage.stageArn,
    webAclArn: webAcl.attrArn,
  });

  const wafLogGroup = new LogGroup(stack, namingHelper(...props.name, 'waf-log-group'), {
    logGroupName: `aws-waf-logs-api-gateway-${namingHelper(...props.name)}`,
    retention: RetentionDays.ONE_YEAR,
    removalPolicy: RemovalPolicy.DESTROY,
    encryptionKey: props.resources.kms,
  });

  new wafv2.CfnLoggingConfiguration(stack, namingHelper(...props.name, 'waf-logging-configuration'), {
    resourceArn: webAcl.attrArn,
    logDestinationConfigs: [wafLogGroup.logGroupArn],
  });

  // Apply checkovs skips
  applyCheckovSkips(restApi, [['CKV_AWS_59', 'Other authorizations are in place']]);

  return { restApi };
};
