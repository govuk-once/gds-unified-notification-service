import {
  AccessLogField,
  AccessLogFormat,
  AuthorizationType,
  DomainNameOptions,
  EndpointType,
  IAuthorizer,
  Integration,
  LogGroupLogDestination,
  RestApi,
  SecurityPolicy,
} from 'aws-cdk-lib/aws-apigateway';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { IVpcEndpoint } from 'aws-cdk-lib/aws-ec2';
import { AccountPrincipal, AnyPrincipal, Effect, Policy, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { HttpMethod } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

import { EnvVars } from 'infrastructure/cdk/config';
import { applyCheckovSkips } from 'infrastructure/cdk/utils/applyCheckovSkip';

export interface UNSAPIGatewayGatewayProps {
  readonly name: string[];
  readonly description: string;
  readonly type: 'MTLS' | 'PRIVATE' | 'PUBLIC';
  readonly domain?: string;
  readonly authorizer?: IAuthorizer;
  readonly mtls?: {
    readonly truststore: string;
  };
  readonly resources: {
    readonly mtlsTruststoreUrl?: string;
    readonly vpce?: string[];
    readonly kms: IKey;
  };
  readonly integrations?: Record<
    string,
    {
      readonly path: string;
      readonly method: HttpMethod;
      readonly integration: Integration;
      readonly authorizer?: IAuthorizer;
    }
  >;
  readonly iam?: {
    readonly allowOnlyFromKnownSources?: {
      readonly awsAccountID: string;
      readonly vpceIDs: string[];
      readonly vpceEndpoints: IVpcEndpoint[];
    };
  };
}

export class UNSAPIGatewayGateway extends Construct {
  public readonly restApi: RestApi;
  public readonly props: UNSAPIGatewayGatewayProps;

  //// =====================================================
  // Domain
  //// =====================================================
  protected domainConfig(config: EnvVars, props: UNSAPIGatewayGatewayProps) {
    const { namingHelper } = config.utils;
    // Setup custom domain parameters via SSM configurations
    const rootDomain = config.ssm.hostedZoneName;
    const certificateArn = config.ssm.certificateArnRegional;
    const subdomain = props.domain ? (config.isMainEnv ? props.domain : namingHelper(props.domain)) : null;
    const fullDomain = subdomain ? `${subdomain}.${rootDomain}` : null;

    let hostedZone: route53.IHostedZone | null = null;

    if (rootDomain !== null) {
      hostedZone = route53.HostedZone.fromLookup(this, namingHelper(`restapi`, ...props.name, 'hostedZone'), {
        domainName: rootDomain,
        privateZone: false,
      });
    }

    let certificate: acm.ICertificate | null = null;
    if (certificateArn !== null) {
      certificate = acm.Certificate.fromCertificateArn(
        this,
        namingHelper(`restapi`, ...props.name, 'certificate'),
        certificateArn
      );
    }

    // Infer mtls bucket
    const mtlsTruststoreBucket = props.mtls
      ? s3.Bucket.fromBucketName(
          this,
          namingHelper(`restapi`, ...props.name, 'truststoreBucket'),
          props.mtls.truststore.split(`s3://`).join(``).split(`/`).shift()!
        )
      : null;

    // Prepare domain config
    const domainConfig: { domainName?: DomainNameOptions; disableExecuteApiEndpoint: boolean } = {
      domainName:
        fullDomain && certificate && rootDomain
          ? {
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
            }
          : undefined,
      disableExecuteApiEndpoint: fullDomain && certificate && rootDomain ? true : false,
    };

    return {
      rootDomain,
      certificateArn,
      fullDomain,
      subdomain,
      hostedZone,
      certificate,
      mtlsTruststoreBucket,
      domainConfig,
    };
  }

  constructRoute53Entries(
    config: EnvVars,
    props: UNSAPIGatewayGatewayProps,
    fullDomain: string | null,
    hostedZone: route53.IHostedZone | null
  ) {
    // Provision Route 53 A-Record for Custom Domain mappings
    if (fullDomain && hostedZone) {
      new route53.ARecord(this, config.utils.namingHelper(...props.name, 'domain'), {
        zone: hostedZone,
        recordName: fullDomain,
        target: route53.RecordTarget.fromAlias(new route53targets.ApiGateway(this.restApi)),
      });
    }
  }

  //// =====================================================
  // Rest API utilities
  //// =====================================================

  addIntegration(
    operationId: string,
    path: string,
    method: HttpMethod,
    integration: Integration,
    authorizer?: IAuthorizer
  ) {
    const registeredEndpoints = this.restApi.root.resourceForPath(path).addMethod(method, integration, {
      operationName: operationId,
      // Use custom authorizer if one is set
      authorizer: authorizer ?? this.props.authorizer,
      // Otherwise: Use IAM authorization if we are a private API gateway
      authorizationType: this.props.iam?.allowOnlyFromKnownSources ? AuthorizationType.IAM : undefined,
    });

    applyCheckovSkips(registeredEndpoints, [
      ['CKV_AWS_59', '"Ensure there is no open access to back-end resources through API"'],
    ]);

    return this;
  }

  GET(operationId: string, path: string, integration: Integration, authorizer?: IAuthorizer) {
    return this.addIntegration(operationId, path, HttpMethod.GET, integration, authorizer);
  }
  POST(operationId: string, path: string, integration: Integration, authorizer?: IAuthorizer) {
    return this.addIntegration(operationId, path, HttpMethod.POST, integration, authorizer);
  }
  PATCH(operationId: string, path: string, integration: Integration, authorizer?: IAuthorizer) {
    return this.addIntegration(operationId, path, HttpMethod.PATCH, integration, authorizer);
  }
  DELETE(operationId: string, path: string, integration: Integration, authorizer?: IAuthorizer) {
    return this.addIntegration(operationId, path, HttpMethod.DELETE, integration, authorizer);
  }
  PUT(operationId: string, path: string, integration: Integration, authorizer?: IAuthorizer) {
    return this.addIntegration(operationId, path, HttpMethod.PUT, integration, authorizer);
  }
  HEAD(operationId: string, path: string, integration: Integration, authorizer?: IAuthorizer) {
    return this.addIntegration(operationId, path, HttpMethod.HEAD, integration, authorizer);
  }
  OPTIONS(operationId: string, path: string, integration: Integration, authorizer?: IAuthorizer) {
    return this.addIntegration(operationId, path, HttpMethod.OPTIONS, integration, authorizer);
  }
  ALL(operationId: string, path: string, integration: Integration, authorizer?: IAuthorizer) {
    return this.addIntegration(operationId, path, HttpMethod.ALL, integration, authorizer);
  }

  //// =====================================================
  // Waf
  //// =====================================================
  managedRule(ruleProps: { priority: number; name: string; managedRuleName: string; metricName: string }) {
    return {
      name: ruleProps.name,
      priority: ruleProps.priority,
      statement: {
        managedRuleGroupStatement: {
          vendorName: 'AWS',
          name: ruleProps.managedRuleName,
        },
      },
      overrideAction: { none: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: ruleProps.metricName,
        sampledRequestsEnabled: true,
      },
    };
  }

  constructWAF(config: EnvVars, props: UNSAPIGatewayGatewayProps) {
    // WAFv2 Protection configuration builder
    const webAcl = new wafv2.CfnWebACL(this, config.utils.namingHelper(...props.name, 'waf'), {
      name: config.utils.namingHelper(...props.name, 'waf'),
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        metricName: config.utils.namingHelper(...props.name, 'main-metric'),
        cloudWatchMetricsEnabled: true,
        sampledRequestsEnabled: true,
      },
      rules: [
        this.managedRule({
          priority: 1,
          managedRuleName: 'AWSManagedRulesCommonRuleSet',
          metricName: `${config.prefix}-aws-common-rule-set`,
          name: config.utils.namingHelper(...props.name, 'aws-common-rule-set'),
        }),
        this.managedRule({
          priority: 10,
          managedRuleName: 'AWSManagedRulesKnownBadInputsRuleSet',
          metricName: `${config.prefix}-aws-bad-input-rule-metric`,
          name: config.utils.namingHelper(...props.name, 'aws-bad-input-rule-metric'),
        }),
        this.managedRule({
          priority: 100,
          managedRuleName: 'AWSManagedRulesAnonymousIpList',
          metricName: `${config.prefix}-anonymous-ip-list-rule-metric`,
          name: config.utils.namingHelper(...props.name, 'anonymous-ip-list-rule-metric'),
        }),
      ],
    });

    // Associate WAF with API Stage Deployment
    new wafv2.CfnWebACLAssociation(this, config.utils.namingHelper(...props.name, 'waf-association'), {
      resourceArn: this.restApi.deploymentStage.stageArn,
      webAclArn: webAcl.attrArn,
    });

    const wafLogGroup = new LogGroup(this, config.utils.namingHelper(...props.name, 'waf-log-group'), {
      logGroupName: `aws-waf-logs-api-gateway-${config.utils.namingHelper(...props.name)}`,
      retention: RetentionDays.ONE_YEAR,
      removalPolicy: config.removalPolicy,
      encryptionKey: props.resources.kms,
    });

    new wafv2.CfnLoggingConfiguration(this, config.utils.namingHelper(...props.name, 'waf-logging-configuration'), {
      resourceArn: webAcl.attrArn,
      logDestinationConfigs: [wafLogGroup.logGroupArn],
    });
  }

  //// =====================================================
  // VPCe Policies
  //// =====================================================
  constructPrivatePolicies(config: EnvVars, props: UNSAPIGatewayGatewayProps) {
    // Add VPC endpoint resource policy if configuration is provided
    if (props.iam?.allowOnlyFromKnownSources) {
      // // // this.restApi.addToResourcePolicy(
      // // //   new PolicyStatement({
      // // //     principals: [new AccountPrincipal(props.iam.allowOnlyFromKnownSources.awsAccountID)],
      // // //     actions: ['execute-api:Invoke'],
      // // //     resources: ['execute-api:/*'], // This is part of API Gateway policy - it's ok for it to be *
      // // //     effect: Effect.ALLOW,
      // // //   })
      // // // );

      this.restApi.addToResourcePolicy(
        new PolicyStatement({
          effect: Effect.DENY,
          principals: [new AnyPrincipal()],
          actions: ['execute-api:Invoke'],
          resources: ['execute-api:/*'], // This is part of API Gateway policy - it's ok for it to be *
          conditions: {
            StringNotEquals: {
              'aws:SourceVpce': props.iam.allowOnlyFromKnownSources.vpceIDs,
            },
          },
        })
      );

      // Create external execution invoker IAM role
      const role = new Role(this, config.utils.namingHelper(`iamr-api-gateway`, ...props.name, `private-invoker`), {
        roleName: config.utils.namingHelper(`iamr-api-gateway`, ...props.name, `private-invoker`),
        assumedBy: new AccountPrincipal(props.iam.allowOnlyFromKnownSources.awsAccountID),
      });
      role.node.addDependency(this.restApi);

      role.attachInlinePolicy(
        new Policy(this, config.utils.namingHelper(`iamr`, ...props.name, `gateway-invoker`), {
          statements: [
            new PolicyStatement({
              actions: ['execute-api:Invoke'],
              resources: [this.restApi.arnForExecuteApi()],
            }),
          ],
        })
      );
    }
  }
  constructor(scope: Construct, config: EnvVars, props: UNSAPIGatewayGatewayProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    super(scope, constructNamingHelper(`apigw`, ...props.name));
    this.props = props;

    // Extract preconfigured values
    const { fullDomain, hostedZone, domainConfig } = this.domainConfig(config, props);

    // Initialize API Gateway RestApi
    this.restApi = new RestApi(this, namingHelper(`restapi`, ...props.name, `restapi`), {
      restApiName: namingHelper(`apigw`, ...props.name),
      description: props.description,
      cloudWatchRole: true,
      deployOptions: {
        tracingEnabled: true,
        metricsEnabled: true,
        dataTraceEnabled: false,
        stageName: 'api',

        cachingEnabled: false,
        cacheDataEncrypted: false,
        cacheClusterEnabled: false,

        accessLogDestination: new LogGroupLogDestination(
          new LogGroup(this, namingHelper(`restapi`, ...props.name, `loggroup`), {
            logGroupName: `/aws/apigw/${namingHelper(...props.name)}`,
            retention: RetentionDays.ONE_YEAR,
            encryptionKey: props.resources.kms,
            removalPolicy: config.removalPolicy,
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

      ...(props.iam?.allowOnlyFromKnownSources?.vpceIDs
        ? {
            endpointConfiguration: {
              types: [EndpointType.PRIVATE],
              vpcEndpoints: props.iam.allowOnlyFromKnownSources.vpceEndpoints,
            },
          }
        : {}),

      // Conditional custom domain name setup
      ...domainConfig,
    });

    // Register all HTTP methods & integrations that have been added as props
    for (const [operationId, { path, method, integration, authorizer }] of Object.entries(props.integrations ?? {})) {
      this.addIntegration(operationId, path, method, integration, authorizer);
    }

    // Construct relevant sub resources
    this.constructPrivatePolicies(config, props);
    this.constructWAF(config, props);
    this.constructRoute53Entries(config, props, fullDomain, hostedZone);

    // Apply security checkov exceptions
    applyCheckovSkips(this.restApi, [
      ['CKV_AWS_59', 'Other authorizations are in place'],
      ['CKV_AWS_120', 'Disabled for now and will renable when caching strategy is defined'],
    ]);
  }
}
