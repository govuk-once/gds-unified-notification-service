import {
  APIHandler,
  HandlerDependencies,
  iocGetConfigurationService,
  iocGetObservabilityService,
  StringParameters,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { IFlexNotificationSchema } from '@project/lambdas/interfaces/IFlexNotificationSchema';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.array(IFlexNotificationSchema).min(1);
const responseBodySchema = z.object({ status: z.string() });

export class GetFlexNotification extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'getFlexNotification';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<GetFlexNotification>
  ) {
    super(observability);
    this.injectDependencies(asyncDependencies);
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    const apiKey = await this.config.getParameter(StringParameters.Api.Flex.ApiKey);

    try {
      if (event.headers['x-api-key'] !== apiKey) {
        this.observability.logger.error('No matching API key: ', { apiKey });
        return {
          body: {
            status: 'Unauthorized',
          },
          statusCode: 401,
        };
      }

      this.observability.logger.info('Successful request.');

      return {
        body: {
          status: 'Ok',
        },
        statusCode: 200,
      };
    } catch (error) {
      this.observability.logger.error('Fatal excpetion: ', { error });
      return {
        body: {
          status: 'Internal Server Error',
        },
        statusCode: 500,
      };
    }
  }
}

export const handler = new GetFlexNotification(iocGetConfigurationService(), iocGetObservabilityService()).handler();
