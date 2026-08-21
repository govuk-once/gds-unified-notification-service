import { BatchProcessor, EventType, processPartialResponse } from '@aws-lambda-powertools/batch';
import { PartialItemFailureResponse } from '@aws-lambda-powertools/batch/types';
import { ContentValidationError, UnidentifiableRecordError } from '@common/models/Errors/BadRequestError';
import { QueueEvent, QueueHandler } from '@common/operations/queueOperation';
import { ConfigurationService, ContentValidationService, ObservabilityService } from '@common/services';
import { BoolParameters, zodErrorFormatter } from '@common/utils';
import { Context, SQSRecord } from 'aws-lambda';
import z, { ZodObject, ZodType } from 'zod';

/**
 * Extends QueueHandler to process batch records from a queue via Lambda.
 * Records are processed individually in parallel. Returns a list of failed records
 * for retry in the trigger queue, or throws an Error if the entire batch fails.
 * After 3 failed retry attempts, records are routed to the DLQ.
 */
export abstract class BatchQueueOperation<
  InputSchema extends ZodType = ZodObject,
  IdentifiableRecordSchema extends ZodType = ZodObject,
> extends QueueHandler<z.infer<InputSchema>, PartialItemFailureResponse> {
  protected enableConfig!: string;

  protected requestBodySchema!: InputSchema;
  protected identifiableRecordSchema!: IdentifiableRecordSchema;

  public contentValidationService: ContentValidationService | undefined;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(observability);
  }

  /**
   * Executes analytics or custom logic, if necessary, for a verified identifiable record.
   * @param identifiableRecord - The verified identifiable record payload.
   */
  protected abstract onStart(identifiableRecord: z.infer<IdentifiableRecordSchema>): Promise<void>;

  /**
   * Executes analytics, or custom logic, if necessary, when record handling fails.
   * @param identifiableRecord - The verified identifiable record payload.
   * @param error - The error thrown during record handling.
   */
  protected abstract onError(identifiableRecord: z.infer<IdentifiableRecordSchema>, error: unknown): Promise<void>;

  /**
   * Executes analytics or custom logic, if necessary, for a record after record handling.
   * @param identifiableRecord - The verified identifiable record payload.
   */
  protected abstract onSuccess(identifiableRecord: z.infer<IdentifiableRecordSchema>): Promise<void>;

  /**
   * Publishes metrics tracking the total number of failed records in a batch.
   * @param batchItemFailuresCount - The count of records that failed processing within the batch.
   */
  protected abstract batchItemFailureMetric(batchItemFailuresCount: number): void;

  /**
   * The implementation of the core record handler that validates the SQS record against a schema
   * and executes the primary business logic.
   * @param record - The individual SQS record to process.
   */
  protected abstract recordHandler: (record: SQSRecord) => Promise<void>;

  /**
   * Validates that the record contains a NotificationID and DepartmentID,
   * then extracts the identifiable fields to be used for logging.
   * @param record - The individual SQS record to process.
   * @returns Object containing the extracted identifiable fields.
   */
  protected validateRequiredFields(record: SQSRecord): z.infer<IdentifiableRecordSchema> {
    const { data, error } = this.identifiableRecordSchema.safeParse(record.body);
    if (error) {
      this.observability.logger.error(`Supplied message does not contain required record fields, rejecting record`, {
        raw: record.body,
        error: error ? z.prettifyError(error) : {},
      });

      throw new UnidentifiableRecordError(zodErrorFormatter(error));
    }

    return data;
  }

  /**
   * Validates the record against the schema. If `contentValidationService` is present,
   * it also executes content-level validation. Throws an error if validation fails.
   * @param record - The individual SQS record to process.
   * @returns The SQS record containing the strongly-typed, parsed body.
   */
  protected async validateRecord(record: SQSRecord): Promise<Omit<SQSRecord, 'body'> & { body: z.infer<InputSchema> }> {
    // Added strict validation and contents validation to schema if content validation service is provided
    const contentValidationService = this.contentValidationService;
    const schema = contentValidationService
      ? this.requestBodySchema.superRefine((data, ctx) => {
          try {
            const body = data as Record<string, unknown>;
            if (typeof body.MessageBody === 'string') {
              contentValidationService.validate(body.MessageBody);
            }
          } catch (e) {
            if (e instanceof ContentValidationError) {
              ctx.addIssue({ code: 'custom', message: e.errors[0], path: ['MessageBody'] });
              return;
            }
            ctx.addIssue({
              code: 'custom',
              message: e instanceof Error ? e.message : 'Unknown error in content validation',
              path: ['MessageBody'],
            });
          }
        })
      : this.requestBodySchema;

    const { data, error } = await schema.safeParseAsync(record.body);
    if (error) {
      this.observability.logger.error(`The message in the record failed validation`, {
        raw: record.body,
        error: error ? z.prettifyError(error) : {},
      });
      throw new ContentValidationError(zodErrorFormatter(error));
    }

    return { ...record, body: data };
  }

  /**
   * Wrapper for the core record handler that manages lifecycle hooks (`onStart`, `onSuccess`, `onError`)
   * and provides fallback error logging.
   * @param record - The individual SQS record to orchestrate.
   */
  protected recordHandlerWrapper = async (record: SQSRecord) => {
    const identifiableRecord = this.validateRequiredFields(record);

    await this.onStart(identifiableRecord);
    try {
      await this.recordHandler(record);
      await this.onSuccess(identifiableRecord);
    } catch (error) {
      await this.onError(identifiableRecord, error);
      this.observability.logger.error(`Error during record handling`, {
        operationId: this.operationId,
        error: this.observability.formatError(error),
        identifiableRecord,
      });

      throw error;
    }
  };

  /**
   * Processes a batch of queue records in parallel, validates them, and reports analytics on any processing failures.
   * @param event - The SQS queue event containing incoming records.
   * @param context - The execution context passed by Lambda/SQS.
   * @returns A partial item failure response containing the IDs of any records that failed processing.
   */
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
