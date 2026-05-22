import { BatchProcessor, EventType, processPartialResponse } from '@aws-lambda-powertools/batch';
import { PartialItemFailureResponse } from '@aws-lambda-powertools/batch/types';
import { SqsRecordSchema } from '@aws-lambda-powertools/parser/schemas';
import { QueueEvent, QueueHandler } from '@common/operations/queueOperation';
import { ConfigurationService, ContentValidationService, ObservabilityService } from '@common/services';
import { BoolParameters } from '@common/utils';
import { IAnalytics, IAnalyticsSchema } from '@project/lambdas/interfaces/IAnalyticsSchema';
import { IIdentifiableMessage, IIdentifiableMessageSchema } from '@project/lambdas/interfaces/IMessage';
import { Context, SQSRecord } from 'aws-lambda';
import z, { ZodAny, ZodError, ZodType } from 'zod';

export abstract class BatchQueueOperation<InputSchema extends ZodType = ZodAny> extends QueueHandler<
  z.infer<InputSchema>,
  PartialItemFailureResponse
> {
  protected enableConfig: string;
  public requestBodySchema: InputSchema;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    protected contentValidationService?: ContentValidationService
  ) {
    super(observability);
  }

  public async validateRecord(
    record: SQSRecord,
    props: {
      onIdentified: (identifiableRecord: IIdentifiableMessage) => Promise<void> | void;
      onSuccess?: (validatedRecord: Omit<SQSRecord, 'body'> & { body: z.infer<InputSchema> }) => Promise<void> | void;
      onError?: (
        identifiableRecord: IIdentifiableMessage,
        validationError: ZodError | undefined
      ) => Promise<void> | void;
    }
  ): Promise<Omit<SQSRecord, 'body'> & { body: z.infer<InputSchema> }> {
    type OutputRecord = Omit<SQSRecord, 'body'> & { body: z.infer<InputSchema> & { MessageBody?: string } };

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

    const identifiableRecord = parsedResult.data.body;
    await props.onIdentified(identifiableRecord);

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
      if (props.onError) {
        await props.onError(identifiableRecord, validationError);
      }
      throw new Error(`Record failed parsing, NotificationID: ${parsedResult.data.body.NotificationID}`);
    }

    if (props.onSuccess) {
      await props.onSuccess(validatedRecord.data as OutputRecord);
    }

    return validatedRecord.data as OutputRecord;
  }

  public async validateAnalyticsRecord(record: SQSRecord): Promise<IAnalytics> {
    // Validate Incoming Analytics events
    const parsing = await IAnalyticsSchema.safeParseAsync(record.body);
    if (!parsing.success) {
      this.observability.logger.error(`Failed to parse Analytics event`, z.prettifyError(parsing.error));
      throw new Error(`Failed to parse Analytics Event`);
    }

    return parsing.data;
  }

  public abstract recordHandler: (record: SQSRecord) => Promise<void>;

  protected abstract batchItemFailureMetric: (batchItemFailuresCount: number) => void;

  public async implementation(
    event: QueueEvent<z.infer<InputSchema>>,
    context: Context
  ): Promise<PartialItemFailureResponse> {
    if (this.enableConfig) {
      await this.config.ensureServiceIsEnabled(BoolParameters.Config.Common.Enabled, this.enableConfig);
    }

    const processor = new BatchProcessor(EventType.SQS);
    const failures = await processPartialResponse(event, this.recordHandler, processor, {
      context,
    });

    if (failures.batchItemFailures.length > 0) {
      this.batchItemFailureMetric(failures.batchItemFailures.length);
    }
    return failures;
  }
}
