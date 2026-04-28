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

  protected createPolicyResponse(resource: string, effect: 'Allow' | 'Deny') {
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
      context: {
        exampleKey: 'exampleValue',
      },
    };

    // TODO: Create a dedicate authorizer handler, and organize existing handlers a bit more
    // Overwrite the typing, since http wrapper expects response wrapper
    return authorizerResult as unknown as ITypedRequestResponse<z.ZodAny>;
  }

  public async implementation(
    _event: ITypedRequestEvent<z.ZodAny>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: Context
  ): Promise<ITypedRequestResponse<z.ZodAny>> {
    this.observability.logger.info(`Event received`, _event);
    this.observability.metrics.addMetric(MetricsLabels.MTLS_AUTH_REQUESTS_COUNT, MetricUnit.Count, 1);

    if (_event?.requestContext?.identity?.clientCert?.clientCertPem == undefined) {
      // TODO Add extra logging & alerting - this should never occur, and would indicate misconfiguration - and clientCertPem is only undefined if the mtls has been disabled
      this.observability.metrics.addMetric(MetricsLabels.MTLS_AUTH_REQUESTS_DENIED_COUNT, MetricUnit.Count, 1);
      return this.createPolicyResponse(_event.methodArn, 'Deny');
    }

    // Generate ID based on certificate contents
    const certificateId = createHash('sha256')
      .update((_event.requestContext.identity.clientCert?.clientCertPem ?? 'undefined').trim())
      .digest('hex');
    const certificateRecord = await this.mtlsRevocationDynamoRepository.getRecord(certificateId);

    // No certificate found
    if (certificateRecord == undefined) {
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
      this.observability.metrics.addMetric(
        MetricsLabels.MTLS_AUTH_REQUESTS_DENIED_REVOKED_CERTIFICATE_COUNT,
        MetricUnit.Count,
        1
      );
      return this.createPolicyResponse(_event.methodArn, 'Deny');
    }

    // Allow only if the certificate record states that certificate has not been revoked
    this.observability.metrics.addMetric(MetricsLabels.MTLS_AUTH_REQUESTS_ALLOWED_COUNT, MetricUnit.Count, 1);
    return this.createPolicyResponse(_event.methodArn, 'Allow');
  }
}

export const handler = new MtlsCertificateRevocationAuthorizer(iocGetObservabilityService(), () => ({
  mtlsRevocationDynamoRepository: iocGetMTLSRevocationDynamoRepository(),
})).handler();
