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
} from '@common/middlewares';
import middy, { type MiddyfiedHandler } from '@middy/core';
import type { Context, SQSEvent } from 'aws-lambda';
import type { ZodType, z } from 'zod';

export type QueueEvent = SQSEvent;

export abstract class QueueHandler<
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

  constructor() {
    console.log(`Initialized!`);
    console.log(...arguments);
  }

  public implementation(
    event: ITypedRequestEvent<InferredInputSchema>,
    context: Context
  ): Promise<ITypedRequestResponse<InferredOutputSchema>> {
    throw new Error('Not Implemented');
  }

  protected middlewares(middy: IMiddleware): IMiddleware {
    middy = this.observabilityMiddlewares(middy);
    middy = this.validationMiddlewares(middy);
    return middy;
  }

  /**
   * Adds Observability middlewares
   */
  protected observabilityMiddlewares(middy: IMiddleware): IMiddleware {
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
