import { BatchProcessor, EventType, processPartialResponse } from '@aws-lambda-powertools/batch';
import { PartialItemFailureResponse } from '@aws-lambda-powertools/batch/types';
import { SqsRecordSchema } from '@aws-lambda-powertools/parser/schemas';
import { QueueEvent, QueueHandler } from '@common/operations/queueOperation';
import { ConfigurationService, ContentValidationService, ObservabilityService } from '@common/services';
import { BoolParameters } from '@common/utils';
import { IAnalytics, IAnalyticsSchema } from '@project/lambdas/interfaces/IAnalyticsSchema';
import { IIdentifiableMessage, IIdentifiableMessageSchema } from '@project/lambdas/interfaces/IMessage';
import { Context, SQSRecord } from 'aws-lambda';
import z, { ZodAny, ZodType } from 'zod';

/**
 * Extends QueueHandler to process batch records from a queue via Lambda.
 * Records are processed individually in parallel. Returns a list of failed records
 * for retry in the trigger queue, or throws an Error if the entire batch fails.
 * After 3 failed retry attempts, records are routed to the DLQ.
 */
export abstract class BatchQueueOperation<InputSchema extends ZodType = ZodAny> extends QueueHandler<
  z.infer<InputSchema>,
  PartialItemFailureResponse
> {
  protected enableConfig: string;
  protected requestBodySchema: InputSchema;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    protected contentValidationService?: ContentValidationService
  ) {
    super(observability);
  }

  /**
   * Executes analytics or custom logic, if necessary, for a verified identifiable record.
   * * @param identifiableRecord - The verified identifiable record payload.
   */
  protected abstract onStart(identifiableRecord: IIdentifiableMessage): Promise<void>;

  /**
   * Executes analytics, or custom logic, if necessary, when record handling fails.
   * * @param identifiableRecord - The verified identifiable record payload.
   * * @param error - The error thrown during record handling.
   */
  protected abstract onError(identifiableRecord: IIdentifiableMessage, error: unknown): Promise<void>;

  /**
   * Executes analytics or custom logic, if necessary, for a record after record handling.
   * * @param identifiableRecord - The verified identifiable record payload.
   */
  protected abstract onSuccess(identifiableRecord: IIdentifiableMessage): Promise<void>;

  /**
   * The implementation of the core record handler that validates the SQS record against a schema
   * and executes the primary business logic.
   * * @param record - The individual SQS record to process.
   */
  protected abstract recordHandler: (record: SQSRecord) => Promise<void>;

  /**
   * Publishes metrics tracking the total number of failed records in a batch.
   * * @param batchItemFailuresCount - The count of records that failed processing within the batch.
   */
  protected abstract batchItemFailureMetric: (batchItemFailuresCount: number) => void;

  protected async validateIdentifiableRecord(record: SQSRecord): Promise<IIdentifiableMessage> {
    const parsedResult = await SqsRecordSchema.extend({
      body: IIdentifiableMessageSchema,
    }).safeParseAsync(record);

    if (!parsedResult.success) {
      const errorMsg = `Supplied message does not contain NotificationID or DepartmentID, rejecting record`;
      this.observability.logger.error(errorMsg, {
        raw: record.body,
        error: parsedResult.error ? z.prettifyError(parsedResult.error) : {},
      });

      throw new Error(errorMsg);
    }

    return parsedResult.data.body;
  }

  protected async validateRecord(record: SQSRecord): Promise<Omit<SQSRecord, 'body'> & { body: z.infer<InputSchema> }> {
    type OutputRecord = Omit<SQSRecord, 'body'> & { body: z.infer<InputSchema> & { MessageBody?: string } };

    // Constructs Message fields schema
    const baseSchema = SqsRecordSchema.extend({ body: this.requestBodySchema });

    // Added strict validation and contents validation to schema if content validation service is provided
    const contentValidationService = this.contentValidationService;
    const schema = contentValidationService
      ? baseSchema.strict().superRefine(async (data, ctx) => {
          const typed = data as unknown as OutputRecord;
          if (typed.body?.MessageBody) {
            try {
              await contentValidationService.validate(typed.body.MessageBody);
            } catch (e) {
              ctx.addIssue(`${e}`);
            }
          }
        })
      : baseSchema;

    const validatedRecord = await schema.safeParseAsync(record);

    if (!validatedRecord.success) {
      const validationError = validatedRecord.error;
      const errorMsg = validationError
        ? z.prettifyError(validationError)
        : 'Failed to validate record with unknown error';
      throw new Error(errorMsg);
    }

    return validatedRecord.data as OutputRecord;
  }

  protected async validateAnalyticsRecord(record: SQSRecord): Promise<IAnalytics> {
    // Validate Incoming Analytics events
    const parsing = await IAnalyticsSchema.safeParseAsync(record.body);
    if (!parsing.success) {
      const errorMsg = parsing.error ? z.prettifyError(parsing.error) : 'Failed to parse Analytics event';
      throw new Error(errorMsg);
    }

    return parsing.data;
  }

  protected recordHandlerWrapper = async (record: SQSRecord) => {
    const identifiableRecord = await this.validateIdentifiableRecord(record);

    await this.onStart(identifiableRecord);
    try {
      await this.recordHandler(record);
      await this.onSuccess(identifiableRecord);
    } catch (error) {
      await this.onError(identifiableRecord, error);
      this.observability.logger.error(`Error during record handling`, {
        operationId: this.operationId,
        error: this.observability.utilities.formatError(error),
        identifiableRecord,
      });

      throw error;
    }
  };

  public async implementation(
    event: QueueEvent<z.infer<InputSchema>>,
    context: Context
  ): Promise<PartialItemFailureResponse> {
    if (this.enableConfig) {
      await this.config.ensureServiceIsEnabled(BoolParameters.Config.Common.Enabled, this.enableConfig);
    }

    const processor = new BatchProcessor(EventType.SQS);
    const failures = await processPartialResponse(event, this.recordHandlerWrapper, processor, {
      context,
    });

    if (failures.batchItemFailures.length > 0) {
      this.batchItemFailureMetric(failures.batchItemFailures.length);
    }
    return failures;
  }
}
