import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { ConfigurationService } from '@common/services/configurationService';
import { ProcessingAdapter, ProcessingAdapterRequest, ProcessingAdapterResult } from '@common/services/interfaces';

export class ProcessingAdapterVoid implements ProcessingAdapter {
  constructor(
    protected logger: Logger,
    protected metrics: Metrics,
    protected tracer: Tracer,
    protected config: ConfigurationService
  ) {}

  // Empty shim
  async initialize(): Promise<void> {
    await Promise.resolve();
    return;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async send(request: ProcessingAdapterRequest): Promise<ProcessingAdapterResult> {
    this.logger.info(`Processing using Void adapter - mapping userID to externalUserID`, { userID: request.userID });
    return {
      request: request,
      success: true,
      externalUserID: request.userID,
    };
  }
}
