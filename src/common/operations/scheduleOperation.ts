import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import { HandlerDependencies, initializeDependencies } from '@common/ioc';
import { NotImplementedError } from '@common/models/Errors/InternalServerError';
import { ObservabilityService } from '@common/services';
import middy, { type MiddyfiedHandler } from '@middy/core';
import type { Context, ScheduledEvent } from 'aws-lambda';

export type IScheduleMiddleware = MiddyfiedHandler<
  ScheduledEvent,
  void,
  Error,
  Context,
  Record<string, unknown>
>;

export abstract class ScheduleOperation {
  public abstract operationId: string;
  
  constructor(protected observability: ObservabilityService) {}

  // Storage for IOC injections
  protected dependencies: (() => HandlerDependencies<object>)[] = [];
  
  public injectDependencies(dependencies?: () => HandlerDependencies<object>) {
    this.observability.logger.info(`IoC Injection setup!`);
    if (dependencies) {
      this.dependencies.push(dependencies);
    }
  }

  /**
   * Adds Observability middlewares
   */
  protected observabilityMiddlewares(middy: IScheduleMiddleware): IScheduleMiddleware {
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
        logMetrics(this.observability.metrics as Metrics, {
          captureColdStartMetric: true,
          throwOnEmptyMetrics: false,
        })
      );
  }

  /**
   * Wraps the provided middy instance with observability-specific middlewares.
   * * @param middy - The base middy instance to be enhanced with observability.
   */
  protected middlewares(middy: IScheduleMiddleware): IScheduleMiddleware {
    return this.observabilityMiddlewares(middy);
  }

  /**
   * Serves as a base implementation method intended to be overridden by subclasses.
   * @param _event - The incoming scheduled event data.
   * @param _context - The AWS Lambda context object.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public implementation(_event: ScheduledEvent, _context: Context): Promise<void> {
    this.observability.logger.error(`No implementation found for operation ${this.operationId}`);
    throw new NotImplementedError();
  }

  /**
   * Configures and executes the Lambda handler, including 
   * dependency injection, observability logging, and implementation invocation.
   */
  public handler(): MiddyfiedHandler<ScheduledEvent, void> {
    return this.middlewares(middy()).handler(async (event: ScheduledEvent, context: Context) => {
      // Call DI before each request is handled
      await initializeDependencies(this, this.dependencies);

      // Trigger implementation
      this.observability.logger.info(`Request received`, { event });
      await this.implementation(event, context);
      this.observability.logger.info(`Request completed`);
    });
  }
}
