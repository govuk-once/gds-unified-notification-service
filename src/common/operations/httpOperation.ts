import type { Logger } from '@aws-lambda-powertools/logger';
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import type { Metrics } from '@aws-lambda-powertools/metrics';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import type { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import { iocGetLogger, iocGetMetrics, iocGetTracer } from '@common/ioc';
import {
  type IMiddleware,
  type IRequestEvent,
  type IRequestResponse,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
  requestValidatorMiddleware,
  responseValidatorMiddleware,
  serializeBodyToJson,
} from '@common/middlewares';
import middy, { type MiddyfiedHandler } from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import httpEventNormalizer from '@middy/http-event-normalizer';
import httpHeaderNormalizer from '@middy/http-header-normalizer';
import httpJsonBodyParser from '@middy/http-json-body-parser';
import type { ALBEvent, APIGatewayEvent, APIGatewayProxyEventV2, Context } from 'aws-lambda';
import type { ZodType, z } from 'zod';

export type RequestEvent = APIGatewayEvent | APIGatewayProxyEventV2 | ALBEvent;

export abstract class APIHandler<
  InputSchema extends ZodType,
  OutputSchema extends ZodType,
  InferredInputSchema = z.infer<InputSchema>,
  InferredOutputSchema = z.infer<OutputSchema>,
> {
  public abstract operationId: string;
  public abstract requestBodySchema: InputSchema;
  public abstract responseBodySchema: OutputSchema;

  public logger: Logger = iocGetLogger();
  public metrics: Metrics = iocGetMetrics();
  public tracer: Tracer = iocGetTracer();

  constructor() {}

  public implementation(
    event: ITypedRequestEvent<InferredInputSchema>,
    context: Context
  ): Promise<ITypedRequestResponse<InferredOutputSchema>> {
    throw new Error('Not Implemented');
  }

  protected middlewares(middy: IMiddleware): IMiddleware {
    middy = this.sanitizationMiddlewares(middy);
    middy = this.observabilityMiddlewares(middy);
    middy = this.validationMiddlewares(middy);
    return middy;
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
        injectLambdaContext(this.logger, {
          correlationIdPath: 'requestContext.requestId',
        })
      )
      .use(captureLambdaHandler(this.tracer))
      .use(
        logMetrics(this.metrics, {
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
      .use(requestValidatorMiddleware(this.requestBodySchema))
      .use(responseValidatorMiddleware(this.responseBodySchema));
  }

  // Wrapper FN to consistently initialize operations
  public handler(): MiddyfiedHandler<IRequestEvent, IRequestResponse> {
    return this.middlewares(middy()).handler(async (event, context) => {
      return (await this.implementation(
        event as unknown as ITypedRequestEvent<InferredInputSchema>,
        context
      )) as IRequestResponse;
    });
  }
}
