import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import { ObservabilityService } from '@common/services';
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

export const deserializeRecordBodyFromJson = <OutputType>(
  observability: ObservabilityService
): MiddlewareObj<SQSEvent, QueueEvent<OutputType>, Error> => ({
  before: (request): void => {
    for (let i = 0; i < request.event.Records.length; i++) {
      try {
        request.event.Records[i].body = JSON.parse(request.event.Records[i].body);
      } catch {
        observability.logger.info('Failed parsing JSON within SQS Body', { raw: request.event.Records[i].body });
      }
    }
  },
});

export abstract class QueueHandler<InputType, OutputType = void> {
  public abstract operationId: string;

  constructor(protected observability: ObservabilityService) {}

  public implementation(event: QueueEvent<InputType>, context: Context): Promise<OutputType> {
    throw new Error('Not Implemented');
  }

  protected middlewares(middy: IQueueMiddleware<string, OutputType>): IQueueMiddleware<InputType, OutputType> {
    return this.observabilityMiddlewares(middy).use(
      deserializeRecordBodyFromJson(this.observability)
    ) as IQueueMiddleware<InputType, OutputType>;
  }

  /**
   * Adds Observability middlewares
   */
  protected observabilityMiddlewares(
    middy: IQueueMiddleware<string, OutputType>
  ): IQueueMiddleware<string, OutputType> {
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

  // Wrapper FN to consistently initialize operations
  public handler(): MiddyfiedHandler<QueueEvent<InputType>, OutputType> {
    return this.middlewares(middy()).handler(async (event: QueueEvent<InputType>, context: Context) => {
      this.observability.logger.info(`Request received`, { event });
      const result = await this.implementation(event, context);
      this.observability.logger.info(`Request completed`);
      return result;
    });
  }
}
