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
import type { ALBEvent, APIGatewayEvent, APIGatewayProxyEventV2, Context } from 'aws-lambda';
import type { z, ZodType } from 'zod';

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

  constructor(protected observability: ObservabilityService) {}

  // Storage for IOC injections - when extending use actual class name instead of <object>
  protected dependencies: (() => HandlerDependencies<object>)[] = [];
  public injectDependencies(dependencies?: () => HandlerDependencies<object>) {
    this.observability.logger.info(`IoC Injection setup!`);
    if (dependencies) {
      this.dependencies.push(dependencies);
    }
  }

  public implementation(
    event: ITypedRequestEvent<InferredInputSchema>,
    context: Context
  ): Promise<ITypedRequestResponse<InferredOutputSchema>> {
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
      .use(requestValidatorMiddleware(this.requestBodySchema))
      .use(responseValidatorMiddleware(this.responseBodySchema));
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
      return (await this.implementation(
        event as unknown as ITypedRequestEvent<InferredInputSchema>,
        context
      )) as IRequestResponse;
    });
  }
}
