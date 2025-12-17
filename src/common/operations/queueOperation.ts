import type { Logger } from '@aws-lambda-powertools/logger';
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import type { Metrics } from '@aws-lambda-powertools/metrics';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import type { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import { iocGetLogger, iocGetMetrics, iocGetTracer } from '@common/ioc';
import { type IMiddleware } from '@common/middlewares';
import middy, { MiddyfiedHandler } from '@middy/core';
import type { Context, SQSEvent } from 'aws-lambda';

export type QueueEvent = SQSEvent;

export abstract class QueueHandler {
  public abstract operationId: string;

  public logger: Logger = iocGetLogger();
  public metrics: Metrics = iocGetMetrics();
  public tracer: Tracer = iocGetTracer();

  constructor() {
    console.log(`Initialized!`);
    console.log(...arguments);
  }

  public async implementation(event: QueueEvent, context: Context) {
    throw new Error('Not Implemented');
  }

  protected middlewares(middy: IMiddleware): IMiddleware {
    middy = this.observabilityMiddlewares(middy);
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

  // Wrapper FN to consistently initialize operations
  public handler(): MiddyfiedHandler<SQSEvent, void> {
    return this.middlewares(middy()).handler(async (event, context) => {
      return await this.implementation(event as unknown as QueueEvent, context);
    });
  }
}
