import {
  AccessLogField,
  AccessLogFormat,
  EndpointType,
  IAuthorizer,
  Integration,
  LogGroupLogDestination,
  RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { HttpMethod } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Stack } from 'aws-cdk-lib/core';
import { EnvVars } from 'infrastructure/cdk/config';
export const apiGatewayFactory = (
  stack: Stack,
  config: EnvVars,
  props: {
    name: string[];
    type: 'MTLS' | 'PRIVATE' | 'PUBLIC';
    domain?: string;
    resources: {
      mtlsTruststoreUrl?: string;
      vpce?: string[];
      authorizers?: string[];
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
  }
) => {
  const { namingHelper } = config.utils;

  // Setup custom domain - parameters are exposed via SSM values - these are generated on AWS account setup by infra team
  const rootDomain = config.ssm.hostedZoneName;
  const certificateArn = config.ssm.certificateArnRegional;
  const subdomain = props.domain ? (config.isMainEnv() ? props.domain : namingHelper(props.domain)) : null;
  const fullDomain = subdomain ? `${subdomain}.${rootDomain}` : null;

  console.log({ rootDomain, certificateArn, subdomain, fullDomain });

  const hostedZone = route53.HostedZone.fromLookup(stack, 'HostedZone', {
    domainName: rootDomain,
    privateZone: false,
  });
  const certificate = acm.Certificate.fromCertificateArn(stack, 'certificate', certificateArn);

  // API Gateway
  const restApi = new RestApi(stack, namingHelper(...props.name), {
    restApiName: namingHelper(...props.name),
    description: namingHelper(...props.name),

    disableExecuteApiEndpoint: false,

    deployOptions: {
      tracingEnabled: true,
      metricsEnabled: true,
      cacheDataEncrypted: true,
      cachingEnabled: true,
      dataTraceEnabled: false,
      stageName: 'api',
      accessLogDestination: new LogGroupLogDestination(
        new LogGroup(stack, 'ApiAccessLogs', {
          logGroupName: `/aws/apigw/${namingHelper(...props.name)}`,
          retention: RetentionDays.ONE_YEAR,
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
    ...(props.domain && fullDomain
      ? {
          domainName: {
            domainName: fullDomain,
            certificate: certificate,
            endpointType: EndpointType.REGIONAL, // Recommended for lower latencies/ACM management
          },
        }
      : {}),
  });

  // Register endpoints
  for (const [operationId, { path, method, integration, authorizer }] of Object.entries(props.integrations ?? {})) {
    const resource = restApi.root.resourceForPath(path);
    resource.addMethod(method, integration, {
      operationName: operationId,
      authorizer,
    });
  }

  if (fullDomain) {
    new route53.ARecord(stack, namingHelper(...props.name, 'certificatearnregional'), {
      zone: hostedZone,
      recordName: fullDomain,
      target: route53.RecordTarget.fromAlias(new targets.ApiGateway(restApi)),
    });
  }

  return { restApi };
};
