import {
  AccessLogField,
  AccessLogFormat,
  IAuthorizer,
  Integration,
  LogGroupLogDestination,
  RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import { HttpMethod } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Stack } from 'aws-cdk-lib/core';
import { EnvVars } from 'infrastructure/cdk/config';
export const apiGatewayFactory = (
  stack: Stack,
  config: EnvVars,
  props: {
    name: string[];
    type: 'MTLS' | 'PRIVATE' | 'PUBLIC';
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
  });

  for (const [operationId, { path, method, integration, authorizer }] of Object.entries(props.integrations ?? {})) {
    const resource = restApi.root.resourceForPath(path);
    resource.addMethod(method, integration, {
      operationName: operationId,
      authorizer,
    });
  }

  return { restApi };
};
