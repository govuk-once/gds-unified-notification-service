import type { Logger } from '@aws-lambda-powertools/logger';
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import type { Metrics } from '@aws-lambda-powertools/metrics';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import type { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import middy, { MiddlewareObj, MiddyfiedHandler } from '@middy/core';
import type { Context, SQSEvent, SQSRecord } from 'aws-lambda';

export type QueueEvent<RecordBodyType> = Omit<SQSEvent, 'Records'> & {
  Records: (Omit<SQSRecord, 'body'> & { body: RecordBodyType })[];
};

export type IQueueMiddleware<InputType, OutputType> = MiddyfiedHandler<
  QueueEvent<InputType>,
  OutputType,
  Error,
  Context,
  Record<string, unknown>
>;

export const deserializeRecordBodyFromJson = <OutputType>(): MiddlewareObj<
  SQSEvent,
  QueueEvent<OutputType>,
  Error
> => ({
  before: (request): void => {
    for (let i = 0; i < request.event.Records.length; i++) {
      request.event.Records[i].body = JSON.parse(request.event.Records[i].body);
    }
  },
});

export abstract class QueueHandler<InputType, OutputType = void> {
  public abstract operationId: string;

  constructor(
    protected logger: Logger,
    protected metrics: Metrics,
    protected tracer: Tracer
  ) {}

  public implementation(event: QueueEvent<InputType>, context: Context): Promise<OutputType> {
    throw new Error('Not Implemented');
  }

  protected middlewares(middy: IQueueMiddleware<string, OutputType>): IQueueMiddleware<InputType, OutputType> {
    return this.observabilityMiddlewares(middy).use(deserializeRecordBodyFromJson()) as IQueueMiddleware<
      InputType,
      OutputType
    >;
  }

  /**
   * Adds Observability middlewares
   */
  protected observabilityMiddlewares(
    middy: IQueueMiddleware<string, OutputType>
  ): IQueueMiddleware<string, OutputType> {
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
  public handler(): MiddyfiedHandler<QueueEvent<InputType>, OutputType> {
    return this.middlewares(middy()).handler(async (event: QueueEvent<InputType>, context: Context) => {
      return await this.implementation(event, context);
    });
  }
}
