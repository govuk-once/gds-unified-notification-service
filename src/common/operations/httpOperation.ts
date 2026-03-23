import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import { HandlerDependencies, initializeDependencies } from '@common/ioc';
import {
  type IMiddleware,
  type IRequestEvent,
  type IRequestResponse,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
  requestQueryParametersSchemaValidator,
  requestValidatorMiddleware,
  responseValidatorMiddleware,
  serializeBodyToJson,
} from '@common/middlewares';
import { ObservabilityService } from '@common/services';
import middy, { type MiddyfiedHandler } from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import httpEventNormalizer from '@middy/http-event-normalizer';
import httpHeaderNormalizer from '@middy/http-header-normalizer';
import httpJsonBodyParser from '@middy/http-json-body-parser';
import type { Context } from 'aws-lambda';
import type { ZodType } from 'zod';
import z from 'zod';

export type APIContract<
  RequestBodySchema extends ZodType = ZodType,
  RequestPathParametersSchema extends ZodType = ZodType,
  RequestQueryParametersScehma extends ZodType = ZodType,
  ResponseBodySchema extends ZodType = ZodType,
> = {
  requestBodySchema: RequestBodySchema;
  requestPathParametersSchema: RequestPathParametersSchema;
  requestQueryParametersSchema: RequestQueryParametersScehma;
  responseBodySchema: ResponseBodySchema;
};

export const defineContract = <
  RequestBodySchema extends ZodType,
  RequestPathParametersSchema extends ZodType,
  RequestQueryParametersScehma extends ZodType,
  ResponseBodySchema extends ZodType,
>(contract: {
  requestBodySchema: RequestBodySchema;
  requestPathParametersSchema: RequestPathParametersSchema;
  requestQueryParametersSchema: RequestQueryParametersScehma;
  responseBodySchema: ResponseBodySchema;
}) => contract;

export type IAPIContractEvent<Contract extends APIContract> = ITypedRequestEvent<
  z.infer<Contract['requestBodySchema']>,
  z.infer<Contract['requestPathParametersSchema']>,
  z.infer<Contract['requestQueryParametersSchema']>
>;
export type IAPIContractResponse<Contract extends APIContract> = ITypedRequestResponse<
  z.infer<Contract['responseBodySchema']>
>;

export abstract class APIHandler<
  Contract extends APIContract<
    RequestBodySchema,
    RequestPathParametersSchema,
    RequestQueryParametersScehma,
    ResponseBodySchema
  >,
  RequestBodySchema extends ZodType = Contract['requestBodySchema'],
  RequestPathParametersSchema extends ZodType = Contract['requestPathParametersSchema'],
  RequestQueryParametersScehma extends ZodType = Contract['requestQueryParametersSchema'],
  ResponseBodySchema extends ZodType = Contract['responseBodySchema'],
> {
  public abstract operationId: string;
  public abstract contract: Contract;

  constructor(protected observability: ObservabilityService) {}

  // Storage for IOC injections - when extending use actual class name instead of <object>
  protected dependencies: (() => HandlerDependencies<object>)[] = [];
  public injectDependencies(dependencies?: () => HandlerDependencies<object>) {
    this.observability.logger.info(`IoC Injection setup!`);
    if (dependencies) {
      this.dependencies.push(dependencies);
    }
  }

  public implementation(event: IAPIContractEvent<Contract>, context: Context): Promise<IAPIContractResponse<Contract>> {
    throw new Error('Not Implemented');
  }

  /**
   * Request structure clean up
   * Auto serialize response bodies into JSON
   * Auto catch HTTP Error exceptions & convert them into responses
   */
  protected sanitizationMiddlewares(middy: IMiddleware): IMiddleware {
    return middy
      .use(httpHeaderNormalizer())
      .use(
        httpJsonBodyParser({
          disableContentTypeError: true,
        })
      )
      .use(httpEventNormalizer())
      .use(serializeBodyToJson())
      .use(httpErrorHandler());
  }

  /**
   * Adds Observability middlewares
   */
  protected observabilityMiddlewares(middy: IMiddleware): IMiddleware {
    // TODO: Look into removing slight overlap between powertools observability (xray sdk) and otel (AWS's new preference)
    // https://github.com/aws-powertools/powertools-lambda/discussions/90
    // May need to re-write these middlewares to strip powertools and use @opentelemetry instances instead
    return middy
      .use(
        injectLambdaContext(this.observability.logger, {
          correlationIdPath: 'requestContext.requestId',
        })
      )
      .use(captureLambdaHandler(this.observability.tracer))
      .use(
        logMetrics(this.observability.metrics, {
          captureColdStartMetric: true,
          throwOnEmptyMetrics: false,
        })
      );
  }

  /**
   * Adds layers of structure enforcement for incoming and outcoming data
   */
  protected validationMiddlewares(middy: IMiddleware): IMiddleware {
    return middy
      .use(requestValidatorMiddleware(this.contract.requestBodySchema))
      .use(requestQueryParametersSchemaValidator(this.contract.requestPathParametersSchema))
      .use(requestQueryParametersSchemaValidator(this.contract.requestQueryParametersSchema))
      .use(responseValidatorMiddleware(this.contract.responseBodySchema));
  }

  /**
   * Ties in separate middleware groups
   * @param middy
   * @returns
   */
  protected middlewares(middy: IMiddleware): IMiddleware {
    middy = this.sanitizationMiddlewares(middy);
    middy = this.observabilityMiddlewares(middy);
    middy = this.validationMiddlewares(middy);
    return middy;
  }

  // Wrapper FN to consistently initialize operations
  public handler(): MiddyfiedHandler<IRequestEvent, IRequestResponse> {
    this.observability.metrics.addMetric('API_CALL_TRIGGERED', MetricUnit.Count, 1);
    return this.middlewares(middy()).handler(async (event, context) => {
      // Call DI before each request is handled
      await initializeDependencies(this, this.dependencies);

      //
      return (await this.implementation(event as IAPIContractEvent<Contract>, context)) as unknown as IRequestResponse;
    });
  }
}
