import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  APIHandler,
  HandlerDependencies,
  IMiddleware,
  iocGetMTLSRevocationDynamoRepository,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { MTLSRevocationDynamoRepository } from '@common/repositories/mtlsRevocationDynamoRepository';
import { MetricsLabels, ObservabilityService } from '@common/services';
import type { APIGatewayAuthorizerResult, Context } from 'aws-lambda';
import { createHash } from 'node:crypto';
import z from 'zod';

/**
 * Purpose of this authorizer lambda is to confirm that certificate supplied within the request context
 * (already validated by API Gateway to be signed by the CA and not expired) has not been revoked.
 *
 * Data regarding revocation is stored in the dynamodb
 */
export class MtlsCertificateRevocationAuthorizer extends APIHandler {
  public operationId: string = 'mtlsApiGatewayAuthorizer';
  public requestBodySchema = z.any();
  public responseBodySchema = z.any();

  public mtlsRevocationDynamoRepository: MTLSRevocationDynamoRepository;

  constructor(
    protected observability: ObservabilityService,
    dependencies?: () => HandlerDependencies<MtlsCertificateRevocationAuthorizer>
  ) {
    super(observability);
    this.injectDependencies(dependencies);
  }

  // No sanitization or validators needed for authorizer
  protected sanitizationMiddlewares(middy: IMiddleware): IMiddleware {
    return middy;
  }

  protected validationMiddlewares(middy: IMiddleware): IMiddleware {
    return middy;
  }

  protected createPolicyResponse(
    resource: string,
    effect: 'Allow' | 'Deny',
    context?: Record<string, string>,
    usageIdentifierKey?: string
  ) {
    const authorizerResult: APIGatewayAuthorizerResult = {
      principalId: 'MtlsCertificateRevocationAuthorizer',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: effect,
            Resource: resource,
          },
        ],
      },
      context: context ?? {},
      usageIdentifierKey: usageIdentifierKey,
    };

    return authorizerResult as unknown as ITypedRequestResponse<z.ZodAny>;
  }

  public async implementation(
    _event: ITypedRequestEvent<z.ZodAny>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: Context
  ): Promise<ITypedRequestResponse<z.ZodAny>> {
    this.observability.logger.debug(`Event received`, _event);
    this.observability.metrics.addMetric(MetricsLabels.MTLS_AUTH_REQUESTS_COUNT, MetricUnit.Count, 1);

    const perm = _event['headers']['CloudFront-Viewer-Cert-PEM'];

    if (perm == undefined) {
      this.observability.logger.error(`Request without client cert perm has been presented`);
      this.observability.metrics.addMetric(MetricsLabels.MTLS_AUTH_REQUESTS_DENIED_COUNT, MetricUnit.Count, 1);
      return this.createPolicyResponse(_event.methodArn, 'Deny');
    }

    // Generate ID based on certificate contents
    const certificateId = createHash('sha256').update(decodeURIComponent(perm).trim()).digest('hex');
    const certificateRecord = await this.mtlsRevocationDynamoRepository.getRecord(certificateId);

    // No certificate found
    if (certificateRecord == undefined) {
      this.observability.logger.error(`Request denied as the certicate has no record in DynamoDB`);
      this.observability.metrics.addMetric(
        MetricsLabels.MTLS_AUTH_REQUESTS_DENIED_UNKNOWN_CERTIFICATE_COUNT,
        MetricUnit.Count,
        1
      );
      return this.createPolicyResponse(_event.methodArn, 'Deny');
    }

    this.observability.logger.info(`Certificate record found`, { certificateRecord });

    // Certificate has been revoked
    if (certificateRecord.Revoked) {
      this.observability.logger.error(`Request denied as the certicate has been revoked`);
      this.observability.metrics.addMetric(
        MetricsLabels.MTLS_AUTH_REQUESTS_DENIED_REVOKED_CERTIFICATE_COUNT,
        MetricUnit.Count,
        1
      );
      return this.createPolicyResponse(_event.methodArn, 'Deny');
    }

    // Certificate has no organization linked to it
    if (!certificateRecord.Organization) {
      this.observability.logger.error(
        `Request denied as the certificate has no organization within DynamoDB record - this usually means a data error and needs to be addressed`
      );
      this.observability.metrics.addMetric(
        MetricsLabels.MTLS_AUTH_REQUESTS_DENIED_NO_ORGANIZATION_COUNT,
        MetricUnit.Count,
        1
      );
      return this.createPolicyResponse(_event.methodArn, 'Deny');
    }

    // Allow only if the certificate record states that certificate has not been revoked
    this.observability.metrics.addMetric(MetricsLabels.MTLS_AUTH_REQUESTS_ALLOWED_COUNT, MetricUnit.Count, 1);
    return this.createPolicyResponse(
      _event.methodArn,
      'Allow',
      { Organization: certificateRecord.Organization },
      _event.headers['x-api-key']
    );
  }
}

export const handler = new MtlsCertificateRevocationAuthorizer(iocGetObservabilityService(), () => ({
  mtlsRevocationDynamoRepository: iocGetMTLSRevocationDynamoRepository(),
})).handler();
