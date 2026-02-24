import { ITypedRequestEvent } from '@common/middlewares';
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

  protected async validateApiKey(event: ITypedRequestEvent<unknown>): Promise<boolean> {
    const apiKey = await this.config.getParameter(StringParameters.Api.Flex.ApiKey);
    const providedApiKey = event.headers['x-api-key'];

    if (providedApiKey !== apiKey) {
      this.observability.logger.error('No matching API key: ', { apiKey });
      return false;
    }
    return true;
  }
}
