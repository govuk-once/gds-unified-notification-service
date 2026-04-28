import { QueueHandler } from '@common/operations/queueOperation';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { IIdentifiableMessage, IIdentifiableRecordsSchema } from '@project/lambdas/interfaces/IMessage';
import { SQSRecord } from 'aws-lambda';
import z, { ZodError, ZodObject } from 'zod';

export abstract class BatchQueueOperation<InputType, OutputType> extends QueueHandler<InputType, OutputType> {
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
    const parsedResult = await IIdentifiableRecordsSchema.safeParseAsync(record);
    if (!parsedResult.success) {
      const errorMsg = `Supplied message does not contain NotificationID or DepartmentID, rejecting record`;
      this.observability.logger.info(
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
      throw new Error(`Record failed validation, NotificationID: ${parsedResult.data.body.NotificationID}`);
    }

    if (props.onSuccess) {
      await props.onSuccess(validatedRecord.data);
    }

    return validatedRecord.data;
  }

  public abstract recordHandler: (record: SQSRecord) => Promise<void>;
}
