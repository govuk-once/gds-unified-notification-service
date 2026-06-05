import { ITypedRequestEvent } from '@common/middlewares';
import { UnauthorizedError } from '@common/models/Errors/UnauthorisedError';
import { APIHandler } from '@common/operations/httpOperation';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils';
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

  protected async validateApiKey(event: ITypedRequestEvent<unknown>) {
    const apiKey = await this.config.getParameter(StringParameters.Api.Flex.ApiKey);
    const providedApiKey = event?.headers['x-api-key'];

    if (providedApiKey !== apiKey) {
      this.observability.logger.error('No matching API key: ', { apiKey });
      throw new UnauthorizedError();
    }
  }
}
