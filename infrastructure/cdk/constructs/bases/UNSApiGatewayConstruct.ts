import { RemovalPolicy } from 'aws-cdk-lib';
import {
  AccessLogField,
  AccessLogFormat,
  AuthorizationType,
  DomainNameOptions,
  EndpointType,
  IAuthorizer,
  Integration,
  LogGroupLogDestination,
  Period,
  RestApi,
  SecurityPolicy,
} from 'aws-cdk-lib/aws-apigateway';
import { Certificate, ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { AllowedMethods, ViewerProtocolPolicy, CachePolicy, PriceClass, CfnDistribution, Distribution, OriginRequestPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, RestApiOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { IVpcEndpoint } from 'aws-cdk-lib/aws-ec2';
import { AccountPrincipal, AnyPrincipal, Effect, Policy, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { HttpMethod } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ARecord, HostedZone, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { ApiGateway, CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { BlockPublicAccess, Bucket, BucketEncryption, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { CfnProtection } from 'aws-cdk-lib/aws-shield';
import { Construct } from 'constructs';

import { EnvVars } from 'infrastructure/cdk/config';
import { applyCheckovSkips } from 'infrastructure/cdk/utils/applyCheckovSkip';

type UsageAllowance = {
  // Values are per second
  throttle: {
    rateLimit: number;
    burstLimit: number;
  };
  // Values per month
  quota: {
    limit: number;
  };
};

export interface UNSAPIGatewayProps {
  readonly name: string[];
  readonly description: string;
  readonly type: 'MTLS' | 'PRIVATE' | 'PUBLIC';
  readonly domain?: string;
  readonly authorizer?: IAuthorizer;
  readonly usagePlanDefaults?: UsageAllowance;
  readonly usagePlans?: Record<string, { allowance?: Partial<UsageAllowance> }>;
  readonly cloudFrontEnabled?: boolean;

  readonly mtls?: {
    readonly truststore: string;
  };

  readonly resources: {
    readonly mtlsTruststoreUrl?: string;
    readonly vpce?: string[];
    readonly kms: IKey;
    readonly wafArn?: string
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

export class UNSAPIGateway extends Construct {
  public readonly cloudfront: Distribution | undefined;
  public readonly restApi: RestApi;
  public readonly props: UNSAPIGatewayProps;

  //// =====================================================
  // Domain
  //// =====================================================
  protected domainConfig(config: EnvVars, props: UNSAPIGatewayProps) {
    const { namingHelper } = config.utils;

    // Setup custom domain parameters via SSM configurations
    const rootDomain = config.ssm.hostedZoneName;
    const mtlsCertificateArn = config.ssm.certificateArnRegional;
    const cloudfrontCertificateArn = config.ssm.certificateArnCloudfront;
    const subdomain = props.domain ? (config.isMainEnv ? props.domain : namingHelper(props.domain)) : null;
    const fullDomain = subdomain ? `${subdomain}.${rootDomain}` : null;
    const mtlsDomain = subdomain ? `${subdomain}-mtls.${rootDomain}` : null

    let hostedZone: IHostedZone | null = null;

    if (rootDomain !== null) {
      hostedZone = HostedZone.fromLookup(this, namingHelper(`restapi`, ...props.name, 'hostedZone'), {
        domainName: rootDomain,
        privateZone: false,
      });
    }

    let mtlsCertificate: ICertificate | null = null;
    if (mtlsCertificateArn !== null) {
      mtlsCertificate = Certificate.fromCertificateArn(
        this,
        namingHelper(`restapi`, ...props.name, 'certificate-mtls'),
        mtlsCertificateArn
    )};

    let cloudfrontCertificate: ICertificate | null = null;
    if (cloudfrontCertificateArn !== null) {
      cloudfrontCertificate = Certificate.fromCertificateArn(
        this,
        namingHelper(`restapi`, ...props.name, 'certificate-cloudfront'),
        cloudfrontCertificateArn
      )
    }

    // Infer mtls bucket
    const mtlsTruststoreBucket = props.mtls
      ? Bucket.fromBucketName(
          this,
          namingHelper(`restapi`, ...props.name, 'truststoreBucket'),
          props.mtls.truststore.split(`s3://`).join(``).split(`/`).shift()!
        )
      : null;

    // Prepare domain config
    const domainConfig: { domainName?: DomainNameOptions; disableExecuteApiEndpoint: boolean } = {
      domainName:
        fullDomain && mtlsCertificate && rootDomain
          ? {
              domainName: props.cloudFrontEnabled && mtlsDomain ? mtlsDomain : fullDomain,
              certificate: mtlsCertificate,
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
      disableExecuteApiEndpoint: !!(fullDomain && mtlsCertificate && rootDomain),
    };

    return {
      rootDomain,
      mtlsCertificateArn,
      fullDomain,
      subdomain,
      mtlsDomain,
      hostedZone,
      mtlsCertificate,
      cloudfrontCertificate,
      mtlsTruststoreBucket,
      domainConfig,
    };
  }

  constructRoute53Entries(
    config: EnvVars,
    props: UNSAPIGatewayProps,
    fullDomain: string | null,
    hostedZone: IHostedZone | null,
    suffix?: string,
  ) {
    // Provision Route 53 A-Record for Custom Domain mappings
    if (fullDomain && hostedZone) {
      new ARecord(this, config.utils.namingHelper(...props.name, suffix ? `domain-${suffix}` : 'domain'), {
        zone: hostedZone,
        recordName: fullDomain,
        target: this.cloudfront ? RecordTarget.fromAlias(
          new CloudFrontTarget(this.cloudfront)
        ) : RecordTarget.fromAlias(
          new ApiGateway(this.restApi)
        ),
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
      // If usage plan defaults are in place - all endpoints require an API key
      apiKeyRequired: this.props.usagePlanDefaults !== undefined,
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
  // VPCe Policies
  //// =====================================================
  constructPrivatePolicies(config: EnvVars, props: UNSAPIGatewayProps) {
    // Add VPC endpoint resource policy if configuration is provided
    if (props.iam?.allowOnlyFromKnownSources) {
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

  //// =====================================================
  // Cloudfront
  //// =====================================================
  constructCloudFrontDistribution(
    config: EnvVars, 
    certificate: ICertificate | null, 
    mtlsDomain: string | null,
    fullDomain: string | null
  ): Distribution | undefined {
    const { namingHelper } = config.utils;

    if (!certificate || !mtlsDomain || !fullDomain) {
      console.log("Tried to create cloudfront when no cloudfront certificate or full domain.", certificate, mtlsDomain, fullDomain)
      return undefined
    }

    // Adds s3 bucket for cloudfront
    const cloudfrontBucket = new Bucket(this, namingHelper(...this.props.name, 'bucket', 'cloudfront'), {
      bucketName: namingHelper(`cloudfront-log`, `bucket`),
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: config.removalPolicy,
      autoDeleteObjects: !config.isMainEnv,
      objectOwnership: ObjectOwnership.OBJECT_WRITER,
    });

    // Enables CloudFront distribution in front of API Gateway - rest api origin
    const cloudfront = new Distribution(this, namingHelper(...this.props.name, 'cloudfront'), {
      comment: this.props.description,
      defaultBehavior: {
        origin: new HttpOrigin(mtlsDomain),
        viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
      },
      domainNames: [fullDomain],
      priceClass: PriceClass.PRICE_CLASS_100,
      certificate: certificate,
      logBucket: cloudfrontBucket,
      webAclId: this.props.resources.wafArn ?? undefined,
    });

    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront.CfnDistribution.html
    const cfnDistribution = cloudfront.node.defaultChild as CfnDistribution;
    cfnDistribution.addPropertyOverride('DistributionConfig.ViewerMtlsConfig', {
      Mode: 'passthrough',
    });

    // Enables AWS shield on CloudFront distribution for None Dev environments
    if (config.isNonDevEnv) {
      new CfnProtection(this, namingHelper(...this.props.name, 'cloudfront-shield'), {
        name: namingHelper(...this.props.name, 'cloudfront-shield'),
        resourceArn: cloudfront.distributionDomainName,
      });
    }

    return cloudfront;
  }

  constructor(scope: Construct, config: EnvVars, props: UNSAPIGatewayProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    super(scope, constructNamingHelper(`apigw`, ...props.name));
    this.props = props;

    // Extract preconfigured values
    const { fullDomain, mtlsDomain, hostedZone, domainConfig, cloudfrontCertificate } = this.domainConfig(config, props);

    // Initialize API Gateway RestApi
    const loggroup = new LogGroup(this, namingHelper(`restapi`, ...props.name, `loggroup`), {
      logGroupName: `/aws/apigw/${namingHelper(...props.name)}`,
      retention: RetentionDays.ONE_YEAR,
      encryptionKey: props.resources.kms,
      removalPolicy: config.removalPolicy,
    });

    this.restApi = new RestApi(this, namingHelper(`restapi`, ...props.name, `restapi`), {
      restApiName: namingHelper(`apigw`, ...props.name),
      description: props.description,
      cloudWatchRole: true,
      cloudWatchRoleRemovalPolicy: RemovalPolicy.RETAIN,

      deployOptions: {
        tracingEnabled: true,
        metricsEnabled: true,
        dataTraceEnabled: false,
        stageName: 'api',

        cachingEnabled: false,
        cacheDataEncrypted: false,
        cacheClusterEnabled: false,

        accessLogDestination: new LogGroupLogDestination(loggroup),

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

    this.restApi.deploymentStage.node.addDependency(loggroup);
    this.restApi.node.addDependency(loggroup);

    // Register all HTTP methods & integrations that have been added as props
    for (const [operationId, { path, method, integration, authorizer }] of Object.entries(props.integrations ?? {})) {
      this.addIntegration(operationId, path, method, integration, authorizer);
    }

    if (props.usagePlanDefaults) {
      // Create usage plans & API Keys
      for (const [id, { allowance }] of Object.entries(this.props.usagePlans ?? {})) {
        const usagePlan = this.restApi.addUsagePlan(
          config.utils.constructNamingHelper(...this.props.name, 'usage-plan', id),
          {
            name: config.utils.namingHelper(...this.props.name, 'usage-plan', id),
            throttle: {
              rateLimit: allowance?.throttle?.rateLimit ?? props.usagePlanDefaults.throttle.rateLimit,
              burstLimit: allowance?.throttle?.burstLimit ?? props.usagePlanDefaults.throttle.rateLimit,
            },
            quota: {
              limit: allowance?.quota?.limit ?? props.usagePlanDefaults.quota.limit,
              period: Period.DAY,
            },
          }
        );

        const apiKey = this.restApi.addApiKey(
          config.utils.constructNamingHelper(...this.props.name, 'api-key', id).replace('-', ''),
          {
            apiKeyName: config.utils.namingHelper(...this.props.name, 'api-key', id),
          }
        );
        usagePlan.addApiKey(apiKey);

        // Link the Usage Plan to the API Stage and API Key
        usagePlan.addApiStage({
          stage: this.restApi.deploymentStage,
        });
      }
    }

    // Construct relevant sub resources
    this.constructPrivatePolicies(config, props);

    if (props.cloudFrontEnabled) {
      this.constructRoute53Entries(config, props, mtlsDomain, hostedZone, 'mtls');
      this.cloudfront = this.constructCloudFrontDistribution(config, cloudfrontCertificate, mtlsDomain, fullDomain);
      this.constructRoute53Entries(config, props, fullDomain, hostedZone);
    } else {
      this.constructRoute53Entries(config, props, fullDomain, hostedZone);
    }

    // Apply security checkov exceptions
    applyCheckovSkips(this.restApi, [
      ['CKV_AWS_59', 'Other authorizations are in place'],
      ['CKV_AWS_120', 'Disabled for now and will renable when caching strategy is defined'],
    ]);
    applyCheckovSkips(this.restApi.deploymentStage, [
      ['CKV_AWS_59', 'Other authorizations are in place'],
      ['CKV_AWS_120', 'Disabled for now and will renable when caching strategy is defined'],
    ]);
  }
}
