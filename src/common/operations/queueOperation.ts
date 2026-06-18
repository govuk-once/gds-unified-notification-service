import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import { HandlerDependencies, initializeDependencies } from '@common/ioc';
import { NotImplementedError, SimulatedError } from '@common/models/Errors/InternalServerError';
import { MetricsLabels, ObservabilityService } from '@common/services';
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
    for (const record of request.event.Records) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        record.body = JSON.parse(record.body);
      } catch {
        observability.logger.info('Failed parsing JSON within SQS Body', { raw: record.body });
      }
    }
  },
});

export abstract class QueueHandler<InputType, OutputType> {
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
        logMetrics(this.observability.metrics as Metrics, {
          captureColdStartMetric: true,
          throwOnEmptyMetrics: false,
        })
      );
  }

  protected middlewares(middy: IQueueMiddleware<string, OutputType>): IQueueMiddleware<InputType, OutputType> {
    return this.observabilityMiddlewares(middy).use(
      deserializeRecordBodyFromJson(this.observability)
    ) as unknown as IQueueMiddleware<InputType, OutputType>;
  }

  // Wrapper FN to consistently initialize operations
  public handler(): MiddyfiedHandler<QueueEvent<InputType>, OutputType> {
    return this.middlewares(middy()).handler(async (event: QueueEvent<InputType>, context: Context) => {
      // Call DI before each request is handled
      await initializeDependencies(this, this.dependencies);

      for (const record of event.Records as SQSRecord[]) {
        const receiveCount = Number.parseInt(record.attributes?.ApproximateReceiveCount ?? '1', 10);
        if (receiveCount > 1) {
          this.observability.logger.warn(`SQS message retry attempt`, {
            messageId: record.messageId,
            receiveCount,
            operationId: this.operationId,
            eventSourceARN: record.eventSourceARN,
          });
          this.observability.metrics.addMetric(MetricsLabels.QUEUE_MESSAGE_RETRY_ATTEMPT, MetricUnit.Count, 1);
        }
      }

      // Triggers error based on operation id and notification title - to be removed from prod release!
      // TODO: Set a trigger for analytics that does not use NotificationTitle.
      const eventToOperationMap: Record<string, string> = {
        FAIL_AT_VALIDATION: 'validation',
        FAIL_AT_PROCESSING: 'processing',
        FAIL_AT_DISPATCH: 'dispatch',
        FAIL_AT_ANALYTICS: 'analytics',
      };

      for (const record of event.Records as SQSRecord[]) {
        const object =
          typeof record.body === 'string'
            ? (JSON.parse(record.body) as Record<string, string>)
            : (record.body as Record<string, string>);
        const notificationTitle = object?.NotificationTitle;

        if (eventToOperationMap[notificationTitle] === this.operationId) {
          this.observability.logger.warn(`Simulating an error for operation ${this.operationId}`);
          throw new SimulatedError([`Simulating an error!`]);
        }
      }

      // Trigger implementation
      this.observability.logger.info(`Request received`, { event });
      const result = await this.implementation(event, context);
      this.observability.logger.info(`Request completed`);
      return result;
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public implementation(event: QueueEvent<InputType>, context: Context): Promise<OutputType> {
    this.observability.logger.error(`No implementation found for operation ${this.operationId}`);
    throw new NotImplementedError();
  }
}
