import { APIHandler } from '@common/operations/httpOperation';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { ZodType } from 'zod';

export abstract class FlexAPIHandler<InputSchema extends ZodType, OutputSchema extends ZodType> extends APIHandler<
  InputSchema,
  OutputSchema
> {
  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService
  ) {
    super(observability);
  }
}
