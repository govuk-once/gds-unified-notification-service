import { BatchProcessor, EventType, processPartialResponse } from '@aws-lambda-powertools/batch';
import { PartialItemFailureResponse } from '@aws-lambda-powertools/batch/types';
import { QueueEvent, QueueHandler } from '@common/operations/queueOperation';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { BoolParameters } from '@common/utils';
import { IAnalytics, IAnalyticsSchema } from '@project/lambdas/interfaces/IAnalyticsSchema';
import { IIdentifiableMessage, ISQSIdentifiableSchema } from '@project/lambdas/interfaces/IMessage';
import { Context, SQSRecord } from 'aws-lambda';
import z, { ZodError, ZodObject } from 'zod';

export abstract class BatchQueueOperation<InputType> extends QueueHandler<InputType, PartialItemFailureResponse> {
  protected enableConfig: string;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(observability);
  }

  public async validateRecord<SchemaType extends ZodObject>(
    schema: SchemaType,
    record: SQSRecord,
    props: {
      onIdentified: (identifiableRecord: IIdentifiableMessage) => Promise<void> | void;
      onSuccess: (validatedRecord: z.infer<SchemaType>) => Promise<void> | void;
      onError: (
        identifiableRecord: IIdentifiableMessage,
        validationError: ZodError | undefined
      ) => Promise<void> | void;
    }
  ): Promise<z.infer<SchemaType>> {
    const parsedResult = await ISQSIdentifiableSchema.safeParseAsync(record);
    if (!parsedResult.success) {
      const errorMsg = `Supplied message does not contain NotificationID or DepartmentID, rejecting record`;
      this.observability.logger.error(
        `Supplied message does not contain NotificationID or DepartmentID, rejecting record`,
        {
          raw: record.body,
          error: parsedResult.error ? z.prettifyError(parsedResult.error) : {},
        }
      );

      throw new Error(errorMsg);
    }

    const identifiableRecord = parsedResult.data.body;
    await props.onIdentified(identifiableRecord);
    const validatedRecord = await schema.safeParseAsync(record);

    if (!validatedRecord.success) {
      const validationError = validatedRecord.error;
      if (props.onError) {
        await props.onError(identifiableRecord, validationError);
      }
      throw new Error(`Record failed parsing, NotificationID: ${parsedResult.data.body.NotificationID}`);
    }

    if (props.onSuccess) {
      await props.onSuccess(validatedRecord.data);
    }

    return validatedRecord.data;
  }

  public async validateAnalyticsRecord(record: SQSRecord): Promise<IAnalytics> {
    // Validate Incoming Analytics events
    const parsing = await IAnalyticsSchema.safeParseAsync(record.body);
    if (!parsing.success) {
      this.observability.logger.error(`Failed to parse Analytics event`, z.prettifyError(parsing.error));
      throw new Error(`Failed to parse Analytics Event`);
    }

    // Map SQS Records to analytics entries
    const entry = parsing.data;

    return entry;
  }

  public abstract recordHandler: (record: SQSRecord) => Promise<void>;

  protected abstract batchItemFailureMetric: (batchItemFailuresCount: number) => void;

  public async implementation(event: QueueEvent<InputType>, context: Context): Promise<PartialItemFailureResponse> {
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
